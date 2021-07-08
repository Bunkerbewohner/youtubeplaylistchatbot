import Discord, {Message} from "discord.js";

const APP_ID = 862625770492133376;
const PUBLIC_KEY = "0c691d7955fd5b1c407d1a21745ced936e2972a07aa82a096b5eb24c2c2dcb21";
const PERMISSIONS = 85056; // view channels, send messages, embed links, read message history, add reactions

const client = new Discord.Client();

function log(msg: string) {
    console.log(msg);
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
    const videos = extractYouTubeLinks(message.content);
}

async function main() {
    log("Authenticating...");
    const onReady = new Promise<void>((resolve) => {
        client.on("ready", resolve);
    });

    await client.login(process.env.TOKEN);
    await onReady;

    client.on("message", onMessage);

    log("Ready.");
}

main();