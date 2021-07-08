import Discord, {Message} from "discord.js";
import fetch from "node-fetch";
import sleep from "sleep-promise";

const fs = require("fs").promises;

const YOUTUBE_CREDENTIALS = './.credentials/youtubeauth.json';
const PLAYLIST_ID = "PLcl5QVE3HNaxD10Dlj-b36LimiVfCovMY"; // Seb-curated

const discordClient = new Discord.Client();
let ytAuth: YoutubeAuth | null = null;

function log(msg: string) {
    console.log(msg);
}

interface Refresh {
    client_id: string;
    client_secret: string;
    grant_type: "refresh_token";
    refresh_token: string;
}

interface YoutubeAuth {
    access_token: string;
    refresh: Refresh;
}

export async function youtubeRequest(url: string, options: {
    method: "POST" | "GET",
    jsonParams?: any
}) {
    if (!ytAuth) {
        try {
            const file = `./.credentials/userauth.json`;
            const data = await fs.readFile(file);
            ytAuth = JSON.parse(data.toString());
        } catch (ex) {
            throw new Error("Couldn't load credentials. Please use '!ytp auth' to authorize me.");
        }
    }

    const headers: any = {
        "Authorization": "Bearer " + ytAuth!.access_token,
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

export function getVideoIdFromUrl(videoUrl: string): string | null {
    const pattern = /https:\/\/(www\.)?youtu(\.be\/|be.com\/watch\?v=)(\S+)/i;
    const match = videoUrl.match(pattern);
    if (match) {
        return match[3];
    }

    return null;
}

export async function addVideoToPlaylist(playlistId: string, videoUrl: string) {
    const response = await youtubeRequest("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", {
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
    console.log(json);
}

/**
 * @see https://developers.google.com/youtube/v3/guides/auth/devices
 */
export async function youtubeAuth(callback: (verification_url: string, user_code: string) => void): Promise<{ error: string } | YoutubeAuth> {
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
            const {access_token, expires_in, refresh_token, scope, token_type} = pollJson;
            const refresh = {
                client_id, client_secret, grant_type: "refresh_token", refresh_token
            } as Refresh

            return {access_token, refresh};
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

export function extractYouTubeLinks(message: string): string[] {
    const pattern = /https:\/\/(www\.)?youtu(\.be\/|be.com\/watch\?v=)(\S+)/ig;
    const matches = [...message.matchAll(pattern)];

    if (matches) {
        return matches.map(match => match[0]);
    }

    return [];
}

async function onMessage(message: Message) {
    if (message.content.startsWith("!ytp auth")) {
        const result = await youtubeAuth((verification_url, user_code) => {
            message.reply(`Hi there! Please go to ${verification_url} and enter the code '${user_code}'`)
        });

        if ('error' in result) {
            message.reply("Something went wrong: " + result.error);
        } else {
            message.reply("Success!");

            // save authentication details for this user
            const file = `./.credentials/userauth.json`;
            await fs.writeFile(file, JSON.stringify(result));
            ytAuth = result;
        }
    }

    if (message.content.startsWith("!ytp add")) {
        const videoUrl = message.content.substr(8).trim();
        log(`Adding video ${videoUrl} to playlist`);

        try {
            await addVideoToPlaylist(PLAYLIST_ID, videoUrl);
            message.reply(`Added ${videoUrl} to https://www.youtube.com/playlist?list=${PLAYLIST_ID}`)
        } catch (ex) {
            message.reply("Failed to add video to playlist: " + ex.message);
        }
    }

    const videos = extractYouTubeLinks(message.content);
    if (videos.length > 0) {
        for (let video of videos) {
            try {
                await addVideoToPlaylist(PLAYLIST_ID, video);
            } catch (ex) {
                log("Failed to add video: " + ex.message);
            }
        }
    }
}

async function main() {
    log("Authenticating...");
    const onReady = new Promise<void>((resolve) => {
        discordClient.on("ready", resolve);
    });

    await discordClient.login(process.env.TOKEN);
    await onReady;

    discordClient.on("message", onMessage);

    log("Ready.");
}

(async function () {
    main();
})();