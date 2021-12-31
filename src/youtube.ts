import {promises as fs} from "fs";
import fetch from "node-fetch";
import {getVideoIdFromUrl} from "./parsing";
import sleep from "sleep-promise";
import {loadJson, saveJson} from "./persistence";
import {log} from "./logging";

export type UserId = string;

// see https://developers.google.com/youtube/v3/guides/auth/devices#creatingcred
const YOUTUBE_CREDENTIALS = './.credentials/youtubeauth.json';

export interface Refresh {
    client_id: string;
    client_secret: string;
    grant_type: "refresh_token";
    refresh_token: string;
}

export interface YoutubeAuth {
    access_token: string;
    refresh: Refresh;
}

const storedAuth: {[userId: string]: YoutubeAuth} = {};

function getAuthPathForUser(userId: UserId) {
    return `./.credentials/userauth-${userId}.json`;
}

async function getAuth(userId: UserId): Promise<YoutubeAuth> {
    let ytAuth = storedAuth[userId];

    if (!ytAuth) {
        try {
            ytAuth = await loadJson<YoutubeAuth>(getAuthPathForUser(userId));
            storedAuth[userId] = ytAuth;
        } catch (ex) {
            throw new Error("Couldn't load credentials. Please use '!ytp auth' to authorize me.");
        }
    }

    return ytAuth;
}

export async function youtubeRequest(url: string, options: {
    userId: UserId,
    method: "POST" | "GET",
    jsonParams?: any
}) {
    let ytAuth = await getAuth(options.userId);

    const headers: any = {
        "Authorization": "Bearer " + ytAuth.access_token,
    }
    if (options.jsonParams) {
        headers["Accept"] = "application/json";
        headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, {
        headers: headers,
        method: options.method,
        body: options.jsonParams ? JSON.stringify(options.jsonParams) : undefined,
    })

    if ((response.status === 403 || response.status === 401) && ytAuth && ytAuth.refresh) {
        // need to refresh access token
        const params = new URLSearchParams();
        params.set("client_id", ytAuth.refresh.client_id);
        params.set("client_secret", ytAuth.refresh.client_secret);
        params.set("grant_type", "refresh_token")
        params.set("refresh_token", ytAuth.refresh.refresh_token);
        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            body: params as any,
        });
        if (refreshResponse.ok) {
            const refreshJson = await refreshResponse.json();
            ytAuth.access_token = refreshJson.access_token;

            // now retry
            youtubeRequest.apply(null, arguments as any);
        } else {
            throw new Error("Failed to refresh access token. Please use '!ytp auth' to authorize me again.");
        }
    } else if (!response.ok) {
        throw new Error("Request failed: " + JSON.stringify(await response.json()));
    }

    return response;
}

/**
 * @param userId current user of the discord bot, must have been authorized before
 * @param playlistId id of a playlist owned by the authorized user
 * @param videoUrl URL of the video to add
 */
export async function addVideoToPlaylist(userId: string, playlistId: string, videoUrl: string) {
    const response = await youtubeRequest("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
        userId,
        method: "POST",
        jsonParams: {
            snippet: {
                playlistId: playlistId,
                position: 0,
                resourceId: {
                    "kind": "youtube#video",
                    "videoId": getVideoIdFromUrl(videoUrl),
                }
            }
        }
    });

    const json = await response.json();
    log(`Added ${videoUrl} to playlist https://www.youtube.com/playlist?list=${playlistId}`);
}

/**
 * @see https://developers.google.com/youtube/v3/guides/auth/devices
 */
export async function youtubeAuth(userId: UserId, callback: (verification_url: string, user_code: string) => void): Promise<{ error: string } | YoutubeAuth> {
    const secretsBuffer = await fs.readFile(YOUTUBE_CREDENTIALS);
    const secrets = JSON.parse(secretsBuffer.toString());
    const {client_id, client_secret} = secrets.installed;
    const scope = "https://www.googleapis.com/auth/youtube";
    let url = "https://oauth2.googleapis.com/device/code?";
    url += "client_id=" + encodeURIComponent(client_id);
    url += "&scope=" + encodeURIComponent(scope);

    const startedTime = Date.now();
    const response = await fetch(url, {method: "POST"});
    const json = await response.json();
    const {verification_url, user_code, device_code, interval, expires_in} = json;
    log(`Go to ${verification_url} and enter '${user_code}'`)
    callback(verification_url, user_code);

    let success = false;

    do {
        log("Waiting for user to authorize...");
        await sleep(interval * 1000);
        const pollUrl = "https://oauth2.googleapis.com/token";
        const params = new URLSearchParams();
        params.set("client_id", client_id);
        params.set("client_secret", client_secret);
        params.set("device_code", device_code);
        params.set("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
        const pollResponse = await fetch(pollUrl, {method: "POST", body: params as any})
        success = pollResponse.ok;

        if (success) {
            const pollJson = await pollResponse.json();
            const {
                access_token,
                expires_in,
                refresh_token,
                scope,
                token_type
            } = pollJson;
            const refresh = {
                client_id, client_secret, grant_type: "refresh_token", refresh_token
            } as Refresh

            const ytAuth = {access_token, refresh};

            storedAuth[userId] = ytAuth;
            await saveJson(getAuthPathForUser(userId), ytAuth);

            return ytAuth;
        } else if (pollResponse.status === 403) {
            return {error: "user denied access"}; // user denied access
        } else if (pollResponse.status !== 428) { // 428 == precondition required, waiting for user to enter code
            // unexpected error
            const pollJson = await pollResponse.json();
            return {error: JSON.stringify(pollJson)};
        }
    } while (!success && (startedTime + expires_in * 1000) > Date.now());

    // timeout
    return {error: "timeout"};
}
