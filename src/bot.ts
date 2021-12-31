import Discord, {Message} from "discord.js";
import {extractYouTubeLinks} from "./parsing";
import {addVideoToPlaylist, YoutubeAuth, youtubeAuth} from "./youtube";
import assert from "assert";
import {log} from "./logging";

export type PlaylistID = string;

export interface BotSettings {
    userId: string;
    server: string;

    connections: {[channelId: string]: PlaylistID};
}

export class YoutuplyBot {
    private commandHandlers: { [commandName: string]: (message: Message) => Promise<void> } = {};

    // called by the bot if settings were changed by the user through a chat message
    public onSettingsChanged?: (settings: BotSettings) => Promise<void>;

    public get userId() {
        return this.settings.userId;
    }

    constructor(public settings: BotSettings, private readonly discordClient: Discord.Client) {
        this.commandHandlers = {
            'setup': this.onSetupRequest,
            'add': this.onAddVideoDirectly,
            'connect': this.onConnectChannelToPlaylist,
            'help': this.onHelp,
        }
    }

    static isSetupRequest(message: Message) {
        return message.content.startsWith("!ytp setup");
    }

    parseCommandFromMessage(message: Message) {
        if (!message.content.startsWith("!ytp")) return {
            commandName: "invalidCommand",
            params: ""
        };

        const parts = message.content.split(" ", 3);
        assert(parts[0] === "!ytp");

        const commandName = parts.length > 1 ? parts[1] : "invalidCommand";

        return {
            commandName,
            params: parts.length > 2 ? parts[2] : "",
        }
    }

    async onMessage(message: Message) {
        if (message.content.startsWith("!ytp")) {
            try {
                const {commandName} = this.parseCommandFromMessage(message);
                const handler = this.commandHandlers[commandName];

                if (handler) {
                    await handler(message);
                } else {
                    // unknown command
                    message.reply(`Error: Invalid command`);

                    await this.onHelp(message);
                }
            } catch (ex: any) {
                try {
                    // inform user that something went wrong
                    const user = await this.discordClient.users.fetch(this.userId);
                    await user.send(`Error processing command: ${ex}`);
                } catch (ex: any) {
                    log(`Failed to send error: User '${this.userId}' doesn't exist.`);
                }
            }
        } else {
            await this.scanMessageForVideos(message);
        }
    }

    // looks for youtube links and adds them to playlists as configured by the user
    scanMessageForVideos = async (message: Message) => {
        const videos = extractYouTubeLinks(message.content);

        if (videos.length === 0) {
            return;
        }

        for (const [channelId, playlistId] of Object.entries(this.settings.connections)) {
            if (channelId !== message.channel.id) {
                continue;
            }

            for (let video of videos) {
                try {
                    await addVideoToPlaylist(this.userId, playlistId, video);
                } catch (ex: any) {
                    log("Failed to add video: " + ex.message);
                }
            }
        }
    }

    onSetupRequest = async (message: Message) => {
        assert(message.content.startsWith("!ytp setup"));

        const result = await youtubeAuth(this.userId, (verification_url, user_code) => {
            message.reply(`Hi there! Please go to ${verification_url} and enter the code '${user_code}'`)
        });

        if ('error' in result) {
            await message.reply("Something went wrong: " + result.error);
        } else {
            await message.reply("Success!");
        }
    }

    onAddVideoDirectly = async (message: Message) => {
        assert(message.content.startsWith("!ytp add"));

        const {params} = this.parseCommandFromMessage(message);
        const parts = params.split(" ");
        assert(parts.length === 2);
        const videoUrl = parts[0].trim();
        const playlistId = parts[1].trim();

        log(`Adding video ${videoUrl} to playlist ${playlistId}`);

        try {
            await addVideoToPlaylist(this.userId, playlistId, videoUrl);
            await message.reply(`Added ${videoUrl} to https://www.youtube.com/playlist?list=${playlistId}`)
        } catch (ex: any) {
            await message.reply("Failed to add video to playlist: " + ex.message);
        }
    }

    // When the user types '!ytp connect $playlistId' the bot will listen
    // for video URLs posted in this channel and automatically add them to the
    // given YouTube playlist.
    onConnectChannelToPlaylist = async (message: Message) => {
        const {commandName, params} = this.parseCommandFromMessage(message);
        assert(commandName === "connect");
        assert(!!params);

        const playlistId = params.trim();
        assert(playlistId, "playlist id must not be empty");
        this.settings.connections[message.channel.id] = playlistId;

        if (this.onSettingsChanged) {
            await this.onSettingsChanged(this.settings);
        }

        await message.reply(`Videos posted in this channel will now automatically be added to https://www.youtube.com/playlist?list=${playlistId}`);
    }

    onHelp = async (message: Message) => {
        // TODO
        await message.reply('HELP: Ask Mathias how to use this.');
    }

    // called when this bot is deleted
    onDelete() {
    }
}
