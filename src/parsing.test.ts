import {extractYouTubeLinks, getVideoIdFromUrl} from "./parsing";

describe("extractYouTubeLinks", () => {
    it("works for messages that are just links to videos", () => {
        expect(extractYouTubeLinks("https://www.youtube.com/watch?v=4UuY8XdXHjg"))
            .toEqual(["https://www.youtube.com/watch?v=4UuY8XdXHjg"]);

        expect(extractYouTubeLinks("https://youtu.be/4UuY8XdXHjg"))
            .toEqual(["https://youtu.be/4UuY8XdXHjg"]);
    });

    it("can extract multiple links from one message", () => {
        expect(
            extractYouTubeLinks("Check out https://youtu.be/4UuY8XdXHjg and" +
                " https://www.youtube.com/watch?v=4UuY8XdXHjg")
        ).toEqual(
            ["https://youtu.be/4UuY8XdXHjg", "https://www.youtube.com/watch?v=4UuY8XdXHjg"]
        )
    })
});

describe("getVideoIdFromUrl", () => {
    it("works", () => {
        expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=4UuY8XdXHjg"))
            .toEqual("4UuY8XdXHjg");

        expect(getVideoIdFromUrl("https://youtu.be/4UuY8XdXHjg"))
            .toEqual("4UuY8XdXHjg");
    });
});
