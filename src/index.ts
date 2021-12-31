import Discord, {Message} from "discord.js";
import {BotSettings, YoutuplyBot} from "./bot";
import {ensureDir, loadJson, saveJson} from "./persistence";
import {UserId} from "./youtube";
import * as Path from "path";
import {log} from "./logging";

const fs = require("fs").promises;

const discordClient = new Discord.Client();

const instancesByUser: {[userId: string]: YoutuplyBot} = {};

async function saveInstance(bot: YoutuplyBot, dir: string = "./instances") {
    const filename = `${bot.settings.serverId}_${bot.settings.userId}.json`;
    await saveJson(`${dir}/${filename}`, bot.settings);
}

async function loadInstance(path: string): Promise<YoutuplyBot> {
    const settings = await loadJson<BotSettings>(path);
    return new YoutuplyBot(settings, discordClient);
}

async function loadInstances(onLoadError: (userId: UserId, server: string, error: string) => Promise<void>, dir: string = "./instances") {
    await ensureDir(dir);

    const files = await fs.readdir(dir);
    for (let file of files) {
        if (file.endsWith(".json")) {
            let bot: YoutuplyBot | undefined = undefined;
            try {
                bot = await loadInstance(Path.join(dir, file));
                instancesByUser[bot.userId] = bot;
                bot.onSettingsChanged = (_) => saveInstance(bot!);
                log(`Loaded bot instance "${bot.userId}" from '${file}'`);
            } catch (ex: any) {
                const filename = Path.basename(file, ".json");
                let userId = filename;
                let serverId = '';

                // some files were saved as [userId].json, some [serverId]_[userId].json
                if (userId.indexOf('_')) {
                    [serverId, userId] = filename.split('_');
                }

                await onLoadError(userId, bot?.settings.serverName ?? serverId ?? 'unknown', ex.toString());
                log(`Failed to load bot instance from '${file}': ${ex}`);
            }
        }
    }
}

async function onMessage(message: Message) {
    if (YoutuplyBot.isSetupRequest(message)) {
        // a new user wants to use the bot
        const userId = message.author.id;

        if (instancesByUser[userId]) {
            // User requested setup even though bot already was loaded.
            // Remove the existing one and start over
            const preexisting = instancesByUser[userId];
            preexisting.onDelete();
            delete instancesByUser[userId];
        }

        const settings: BotSettings = {
            userId,
            connections: {},
            serverId: message.guild?.id ?? 'unknown',
            serverName: message.guild?.name ?? 'unknown',
        }
        const bot = instancesByUser[userId] = new YoutuplyBot(settings, discordClient);
        bot.onSettingsChanged = (_) => saveInstance(bot);
        await bot.onMessage(message);
        await saveInstance(bot);
    } else {
        if (message.channel.type === 'dm') {
            const recipientBot = instancesByUser[message.channel.recipient.id];
            const senderBot = instancesByUser[message.author.id];

            if (recipientBot) {
                await recipientBot.onMessage(message);
            }

            if (senderBot) {
                await senderBot.onMessage(message);
            }
        } else {
            // TODO: Actually check if the bot/user is allowed to see that message.
            // Right now any message in any non-DM channel can be used, regardless
            // of whether the bot/user has permissions to see messages in it.
            for (let bot of Object.values(instancesByUser)) {
                bot.onMessage(message);
            }
        }
    }
}

async function main() {
    log("Authenticating...");
    const onReady = new Promise<void>((resolve) => {
        discordClient.on("ready", resolve);
    });

    await discordClient.login(process.env.DISCORD_TOKEN);
    await onReady;

    await loadInstances(async (userId, server: string, error) => {
        // Loading of the bot for userId failed.
        // Inform user that they need to reauthenticate.
        log(`Loading of YoutuplyBot for user '${userId}' failed: ${error}`)

        try {
            const user = await discordClient.users.fetch(userId);
            await user.send(`Hi! There is a problem with your Youtuply setup. 
            Please repeat the setup using '!ytp setup' on some channel of the server '${server}'`)
        } catch (ex: any) {
            log(`User '${userId}' could not be loaded.`);
        }
    });

    discordClient.on("message", onMessage);

    log("Ready.");
}

(async function () {
    main();
})();
