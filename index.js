const {
  Client,
  GatewayIntentBits,
  ActivityType
} = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN?.trim();

if (!token) {
  throw new Error('DISCORD_BOT_TOKEN 환경변수가 설정되어 있지 않습니다.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once('ready', () => {
  console.log(`💛 희낙이봇 온라인 완료: ${client.user.tag}`);

  client.user.setPresence({
    activities: [
      {
        name: '💛 희희낙락 공식 앱',
        type: ActivityType.Custom
      }
    ],
    status: 'online'
  });
});

client.login(token);