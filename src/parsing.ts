
export function extractYouTubeLinks(message: string): string[] {
    const pattern = /https:\/\/(www\.)?youtu(\.be\/|be.com\/watch\?v=)(\S+)/ig;
    const matches = [...message.matchAll(pattern)];

    if (matches) {
        return matches.map(match => match[0]);
    }

    return [];
}

export function getVideoIdFromUrl(videoUrl: string): string | null {
    const pattern = /https:\/\/(www\.)?youtu(\.be\/|be.com\/watch\?v=)(\S+)/i;
    const match = videoUrl.match(pattern);
    if (match) {
        return match[3];
    }

    return null;
}
