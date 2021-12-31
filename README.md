# Youtuply = YouTube PlayList Chatbot 

## About

This discord bot listens for YouTube links in messages and automatically adds them to a (currently hardcoded) playlist.

## Setup

First install the Discord bot:

https://discord.com/api/oauth2/authorize?client_id=862625770492133376&permissions=0&scope=bot

Then authorize the bot to modify YouTube playlists using your YouTube account:

> !ytp auth

Afterwards all YouTube links posted in any channel will automatically added to the hardcoded playlist.

## Development

1. Get credentials from https://console.cloud.google.com/apis/credentials?project=youtuply
2. Save JSON as ./.credentials/youtubeauth.json
3. Set TOKEN env variable to Discord API token

## TODO

- allow configuration of target playlist
- clean up the code
- help command
