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
);const token = process.env.DISCORD_BOT_TOKEN;

console.log('===== 희낙이봇 토큰 진단 =====');
console.log('변수 존재:', Boolean(token));
console.log('변수 타입:', typeof token);
console.log('문자 길이:', token ? token.length : 0);
console.log(
  '앞뒤 공백 존재:',
  token ? token !== token.trim() : false
);
console.log('============================');

client.login(
  token ? token.trim() : token
);