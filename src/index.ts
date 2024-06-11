import express from 'express';
import 'dotenv/config';
import axios from 'axios';
import { createServer } from 'https';
import { readFileSync } from 'fs';

const port = 443;// SSL

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/pr', async (_req, res) => {
    const { data } = await axios.get(process.env.DISCORD_PR_WEBHOOK_URL as string);
    res.json(data);
});

app.get('/release', async (_req, res) => {
    const { data } = await axios.get(process.env.DISCORD_RELEASE_WEBHOOK_URL as string);
    res.json(data);
});

const verivicationFileName = process.env.SSL_VERIFICATION_FILE_PATH!.match(/.+\/(.+)$/)![1] as string;
app.get(`/.well-known/pki-validation/${verivicationFileName}`, (_req, res) => {
    res.sendFile(process.env.SSL_VERIFICATION_FILE_PATH as string);
});

app.post('/', async (req, res) => {
    const data = req.body;
    const ciBuildRun = data.ciBuildRun;
    if (!ciBuildRun) {
        console.log('ciBuildRun not found');
        res.sendStatus(200);
        return;
    }
    const ciBuildRunAttributes = ciBuildRun.attributes;
    if (!ciBuildRunAttributes) {
        console.log('ciBuildRun.attributes not found');
        res.sendStatus(200);
        return;
    }
    const executionProgress = ciBuildRunAttributes.executionProgress;
    console.log(`Build execution progress: ${executionProgress}`);
    if (executionProgress !== 'COMPLETE') {
        res.sendStatus(200);
        return;
    }
    const appId = data.app.id;
    if (!appId) {
        console.log('App ID not found');
        res.sendStatus(200);
        return;
    }
    const buildNumber = ciBuildRunAttributes.number;
    const buildId = ciBuildRun.id;
    if (!buildId) {
        console.log('Build ID not found');
        res.sendStatus(200);
        return;
    }
    const buildEmbeds = [{
        "title": `ビルド${buildNumber ?? ''}`,
        "url": `https://appstoreconnect.apple.com/teams/${process.env.XCODE_CLOUD_TEAM_ID}/apps/${appId}/ci/builds/${buildId}/summary`,
    }];
    const completionStatus = ciBuildRunAttributes.completionStatus;
    if (completionStatus !== 'SUCCEEDED') {
        console.log('Build failed');
        const discordResponse = await axios.post(
            `${process.env.DISCORD_RELEASE_WEBHOOK_URL}?wait=true`,
            {
                content: '<@&1103653627228336171>\nビルドに失敗しました❌\n詳細を確認してください。',
                embeds: buildEmbeds
            }
        );
        if (discordResponse.status !== 200) {
            console.log('Failed to send message');
        }
        res.sendStatus(200);
        return;
    }
    const appName = data.ciProduct?.attributes?.name ?? 'App';
    const discordResponse = ciBuildRunAttributes.isPullRequestBuild ? await axios.post(
        `${process.env.DISCORD_PR_WEBHOOK_URL}?wait=true`,
        {
            content: '@everyone\nビルドが完了しました！⛏️\nTestFlightよりインストール/アップデートをお願いします！✨',
            embeds: [
                {
                    title: `TestFlight | ${appName}`,
                    url: `itms-beta://beta.itunes.apple.com/v1/app/${appId}`,
                }
            ]
        }
    ) : await axios.post(
        `${process.env.DISCORD_RELEASE_WEBHOOK_URL}?wait=true`,
        {
            content: '<@&1103653627228336171>\nビルドが完了しました！⛏️\nApp Store Connectよりリリースをお願いします！✨',
            embeds: buildEmbeds
        }
    );
    if (discordResponse.status !== 200) {
        console.log('Failed to send message');
    }
    res.sendStatus(200);
});

const server = createServer({
    key: readFileSync(process.env.SSL_KEY_PATH as string),
    cert: readFileSync(process.env.SSL_CERT_PATH as string)
}, app);

server.listen(port, () => {
    console.log(`App listening on port ${port}`);
});
