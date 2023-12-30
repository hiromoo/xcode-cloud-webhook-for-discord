import express from 'express';
import 'dotenv/config';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';

const port = 3000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH as string);

app.get('/', async (_req, res) => {
    const { data } = await axios.get(process.env.DISCORD_WEBHOOK_URL as string);
    res.json(data);
});

app.post('/', async (req, res) => {
    const data = req.body;
    const completionStatus = data.ciBuildRun?.attributes?.completionStatus;
    if (completionStatus !== 'SUCCEEDED') {
        console.log('Build failed');
        res.sendStatus(200);
        return;
    }
    const appId = data.app.id;
    if (!appId) {
        console.log('App ID not found');
        res.sendStatus(200);
        return;
    }
    const appName = data.ciProduct?.attributes?.name ?? 'App';
    const buildId = data.ciBuildRun?.id;
    if (!buildId) {
        console.log('Build ID not found');
        res.sendStatus(200);
        return;
    }
    const buildNumber = data.ciBuildRun?.attributes?.buildNumber;
    if (!buildNumber) {
        console.log('Build number not found');
        res.sendStatus(200);
        return;
    }
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
        {
            iss: process.env.ISSUE_ID,
            iat: now,
            exp: now + 60 * 20,
            aud: 'appstoreconnect-v1'
        },
        privateKey,
        {
            algorithm: 'ES256',
            header: {
                alg: 'ES256',
                kid: process.env.KEY_ID,
                typ: 'JWT'
            }
        }
    );
    const buildGroupResponse = await axios.post(
        `https://api.appstoreconnect.apple.com/v1/builds/${buildId}/relationships/betaGroups`,
        {
            data: [
                {
                    id: process.env.GROUP_ID,
                    type: 'betaGroups'
                }
            ]
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );
    if (buildGroupResponse.status !== 200) {
        console.log('Failed to add build to group');
        res.sendStatus(200);
        return;
    }
    const discordResponse = await axios.post(
        `${process.env.DISCORD_WEBHOOK_URL}?wait=true`,
        {
            content: '@everyone\nビルドが完了しました！⛏️\nTestFlightよりインストール/アップデートをお願いします！✨',
            embeds: [
                {
                    title: `TestFlight | ${appName}`,
                    url: `itms-beta://beta.itunes.apple.com/v1/app/${appId}`,
                }
            ]
        }
    );
    if (discordResponse.status !== 200) {
        console.log('Failed to send message');
        res.sendStatus(200);
        return;
    }
    res.sendStatus(200);
});

app.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
