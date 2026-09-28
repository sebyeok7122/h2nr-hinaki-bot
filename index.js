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

const {
  DISCORD_IDS
} = require('./src/config/constants');

const {
  processMonthlyNewbieMate
} = require('./src/services/newbieMateService');


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
 */
const NEWBIE_ACTIVITY_CHECK_INTERVAL =
  5000;


/*
 * 뉴비메이트 월간 선정 여부는
 * 1시간마다 확인합니다.
 *
 * 이미 처리한 달이면
 * DB 기록을 보고 아무 작업도 하지 않습니다.
 */
const NEWBIE_MATE_CHECK_INTERVAL =
  60 * 60 * 1000;


async function checkMonthlyNewbieMate(
  client
) {
  try {
    const guild =
      client.guilds.cache.get(
        DISCORD_IDS.GUILD_ID
      ) ||
      await client.guilds.fetch(
        DISCORD_IDS.GUILD_ID
      );


    if (!guild) {
      return;
    }


    const result =
      await processMonthlyNewbieMate(
        guild
      );


    /*
     * 이미 처리된 달은
     * 한 시간마다 로그를 남기지 않습니다.
     */
    if (
      result.code ===
      'ALREADY_PROCESSED'
    ) {
      return;
    }


    if (
      result.code ===
      'AWARDED'
    ) {
      console.log(
        `🌱 [뉴비메이트 자동확인] ${result.awardMonth} · ${result.winners.length}명 선정`
      );

      return;
    }


    if (
      result.code ===
      'NO_ACTIVITY'
    ) {
      console.log(
        `🌱 [뉴비메이트 자동확인] ${result.awardMonth} · 선정 대상 없음`
      );

      return;
    }


    if (
      result.code ===
      'ROLE_UPDATE_FAILED'
    ) {
      console.error(
        `❌ [뉴비메이트 자동확인] 역할 처리 실패: ${result.failedUserId}`,
        result.error
      );
    }

  } catch (error) {
    console.error(
      '❌ [뉴비메이트] 월간 자동확인 오류:',
      error
    );
  }
}


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
     * 봇 실행 직후 신입파티 검사
     */
    void checkAllNewbieParties(
      client
    );


    /*
     * 봇 실행 직후 뉴비메이트도 검사합니다.
     *
     * 그래서 매월 1일에 봇이 꺼져 있었어도
     * 다음 실행 시 지난달 기록을 처리합니다.
     */
    void checkMonthlyNewbieMate(
      client
    );


    /*
     * 신입파티 5초마다 검사
     */
    setInterval(
      () => {
        void checkAllNewbieParties(
          client
        );
      },
      NEWBIE_ACTIVITY_CHECK_INTERVAL
    );


    /*
     * 뉴비메이트는 1시간마다 검사
     */
    setInterval(
      () => {
        void checkMonthlyNewbieMate(
          client
        );
      },
      NEWBIE_MATE_CHECK_INTERVAL
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