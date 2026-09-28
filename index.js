const {
  Client,
  Collection,
  GatewayIntentBits,
  ActivityType
} = require('discord.js');

const {
  loadCommands
} = require('./src/loaders/commandLoader');

const {
  handleInteraction
} = require('./src/handlers/interactionHandler');

const {
  handleVoiceStateUpdate,
  checkAllNewbieParties
} = require('./src/handlers/voiceStateHandler');

const {
  initDatabase
} = require('./src/database/db');


const token =
  process.env.DISCORD_BOT_TOKEN?.trim();


if (!token) {
  throw new Error(
    'DISCORD_BOT_TOKEN 환경변수가 설정되어 있지 않습니다.'
  );
}


initDatabase();


const client =
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ]
  });


client.commands =
  new Collection();


loadCommands(client);


/*
 * 신입파티 활동조건은
 * 5초마다 자동으로 다시 확인합니다.
 *
 * 그래서 참가자들이 음성방에서
 * 가만히 있어도 목표시간 도달을
 * 자동으로 감지할 수 있습니다.
 */
const NEWBIE_ACTIVITY_CHECK_INTERVAL =
  5000;


client.once(
  'clientReady',
  () => {
    console.log(
      `💛 희낙이봇 온라인 완료: ${client.user.tag}`
    );


    client.user.setPresence({
      activities: [
        {
          name:
            '💛 희희낙락 공식 앱',

          type:
            ActivityType.Custom
        }
      ],

      status:
        'online'
    });


    /*
     * 봇 실행 직후 한 번 검사
     */
    void checkAllNewbieParties(
      client
    );


    /*
     * 이후 5초마다 자동 검사
     */
    setInterval(
      () => {
        void checkAllNewbieParties(
          client
        );
      },
      NEWBIE_ACTIVITY_CHECK_INTERVAL
    );
  }
);


client.on(
  'interactionCreate',
  async (interaction) => {
    await handleInteraction(
      client,
      interaction
    );
  }
);


client.on(
  'voiceStateUpdate',
  async (
    oldState,
    newState
  ) => {
    await handleVoiceStateUpdate(
      oldState,
      newState
    );
  }
);


client.login(token);