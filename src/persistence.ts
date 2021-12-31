import {promises as fs} from "fs";
import * as Path from "path";

export async function loadJson<T>(path: string) {
    const data = await fs.readFile(path);
    return JSON.parse(data.toString()) as T;
}

export async function saveJson<T>(path: string, object: T) {
    await fs.writeFile(path, JSON.stringify(object));
}

export async function ensureDir(path: string) {
    try {
        await fs.mkdir(path, {recursive: true});
    } catch (ex) {
        // ignore if dir already exists
        if (!ex.message.indexOf("EEXISTS")) {
            throw ex;
        }
    }
}
