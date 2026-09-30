const {
  Client,
  Collection,
  GatewayIntentBits,
  ActivityType
} = require('discord.js');


/*
 * ★ 가장 먼저 DB를 초기화합니다.
 *
 * Railway처럼 완전히 새 DB에서 시작할 때도
 * 다른 서비스들이 SQL을 준비하기 전에
 * 모든 테이블이 먼저 만들어져 있어야 합니다.
 */
const {
  initDatabase
} = require('./src/database/db');


initDatabase();


/*
 * DB 초기화가 끝난 뒤에
 * DB를 사용하는 모듈들을 불러옵니다.
 */
const {
  loadCommands
} = require('./src/loaders/commandLoader');

const {
  handleInteraction
} = require('./src/handlers/interactionHandler');

const {
  processAllRecruitmentQueues
} = require('./src/handlers/recruitButtonHandler');

const {
  handleVoiceStateUpdate,
  checkAllNewbieParties
} = require('./src/handlers/voiceStateHandler');

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
 * 자리알림 대기열도
 * 5초마다 확인합니다.
 *
 * 3분 우선권이 끝난 사람을 정리하고
 * 자동으로 다음 순번에게 넘깁니다.
 */
const RECRUIT_QUEUE_CHECK_INTERVAL =
  5000;


/*
 * 뉴비메이트 월간 선정 여부는
 * 1시간마다 확인합니다.
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
     * 봇 재시작 직후에도
     * 신입파티 상태를 바로 확인합니다.
     */
    void checkAllNewbieParties(
      client
    );


    /*
     * 봇이 꺼져있는 동안
     * 자리알림 우선권 시간이 지났을 수도 있으므로
     * 시작과 동시에 대기열도 한 번 확인합니다.
     */
    void processAllRecruitmentQueues(
      client
    );


    void checkMonthlyNewbieMate(
      client
    );


    setInterval(
      () => {
        void checkAllNewbieParties(
          client
        );
      },
      NEWBIE_ACTIVITY_CHECK_INTERVAL
    );


    /*
     * 3분 우선권 만료 및
     * 다음 대기순번 자동 처리
     */
    setInterval(
      () => {
        void processAllRecruitmentQueues(
          client
        );
      },
      RECRUIT_QUEUE_CHECK_INTERVAL
    );


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