import express from 'express';
import 'dotenv/config';
import axios from 'axios';

const port = 3000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
