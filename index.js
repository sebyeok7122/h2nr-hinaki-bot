const {
  Client,
  GatewayIntentBits,
  ActivityType
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once('ready', () => {

  console.log(
    `💛 희낙이봇 온라인 완료: ${client.user.tag}`
  );

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

client.login(
  process.env.DISCORD_BOT_TOKEN
);
