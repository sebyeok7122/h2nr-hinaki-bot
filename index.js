
const {
  Client,
  Collection,
  GatewayIntentBits,
  ActivityType,
  Partials
} = require('discord.js');


/*
 * ★ 가장 먼저 DB 초기화
 */
const {
  initDatabase
} = require('./src/database/db');

initDatabase();


/*
 * DB 초기화 후 필요한 모듈 로드
 */
const {
  loadCommands
} = require('./src/loaders/commandLoader');

const {
  handleInteraction
} = require('./src/handlers/interactionHandler');

/*
 * ★ 신규: 구인 멤버 멘션 입력 처리
 */
const {
  handleRecruitMentionMessage
} = require('./src/handlers/recruitMentionHandler');

const {
  processAllRecruitmentQueues
} = require('./src/handlers/recruitButtonHandler');

const {
  handleVoiceStateUpdate,
  checkAllNewbieParties
} = require('./src/handlers/voiceStateHandler');

const {
  handleRecruitmentMessageDelete
} = require('./src/handlers/recruitDeleteHandler');

const {
  handleChickenProofReaction
} = require('./src/handlers/chickenProofHandler');

const {
  processExpiredRecruitments
} = require('./src/services/recruitAutoEndService');

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


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],

  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});


client.commands = new Collection();

loadCommands(client);


/*
 * 신입파티 활동조건 확인
 * 5초마다
 */
const NEWBIE_ACTIVITY_CHECK_INTERVAL = 5000;


/*
 * 자리알림 대기열 확인
 * 5초마다
 */
const RECRUIT_QUEUE_CHECK_INTERVAL = 5000;


/*
 * 오래된 파티 자동 종료 확인
 * 1분마다
 */
const RECRUIT_AUTO_END_CHECK_INTERVAL = 60 * 1000;


/*
 * 뉴비메이트 월간 선정 확인
 * 1시간마다
 */
const NEWBIE_MATE_CHECK_INTERVAL = 60 * 60 * 1000;


/*
 * 뉴비메이트 자동 선정
 */
async function checkMonthlyNewbieMate(client) {
  try {
    const guild =
      client.guilds.cache.get(DISCORD_IDS.GUILD_ID) ||
      await client.guilds.fetch(DISCORD_IDS.GUILD_ID);

    if (!guild) return;

    const result = await processMonthlyNewbieMate(guild);

    if (result.code === 'ALREADY_PROCESSED') {
      return;
    }

    if (result.code === 'AWARDED') {
      console.log(
        `🌱 [뉴비메이트 자동확인] ${result.awardMonth} · ${result.winners.length}명 선정`
      );
      return;
    }

    if (result.code === 'NO_ACTIVITY') {
      console.log(
        `🌱 [뉴비메이트 자동확인] ${result.awardMonth} · 선정 대상 없음`
      );
      return;
    }

    if (result.code === 'ROLE_UPDATE_FAILED') {
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


/*
 * 희낙이 온라인
 */
client.once('clientReady', () => {
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


  /*
   * 봇 재시작 직후 상태 확인
   */
  void checkAllNewbieParties(client);
  void processAllRecruitmentQueues(client);
  void processExpiredRecruitments(client);
  void checkMonthlyNewbieMate(client);


  /*
   * 신입파티 활동 확인
   */
  setInterval(() => {
    void checkAllNewbieParties(client);
  }, NEWBIE_ACTIVITY_CHECK_INTERVAL);


  /*
   * 자리알림
   */
  setInterval(() => {
    void processAllRecruitmentQueues(client);
  }, RECRUIT_QUEUE_CHECK_INTERVAL);


  /*
   * 파티 자동 종료
   */
  setInterval(() => {
    void processExpiredRecruitments(client);
  }, RECRUIT_AUTO_END_CHECK_INTERVAL);


  /*
   * 뉴비메이트 월간 확인
   */
  setInterval(() => {
    void checkMonthlyNewbieMate(client);
  }, NEWBIE_MATE_CHECK_INTERVAL);
});


/*
 * 슬래시 명령어 / 버튼 / 선택메뉴
 */
client.on('interactionCreate', async (interaction) => {
  await handleInteraction(client, interaction);
});


/*
 * ★ 신규: 멘션 직접 입력 인식
 *
 * 현재 구인 설정 중인 사람의
 * 채팅 메시지만 recruitMentionHandler가 처리합니다.
 */
client.on('messageCreate', async (message) => {
  try {
    await handleRecruitMentionMessage(message);
  } catch (error) {
    console.error(
      '❌ [구인멘션] 메시지 처리 오류:',
      error
    );
  }
});


/*
 * 신입파티 음성 활동 감지
 */
client.on('voiceStateUpdate', async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
});


/*
 * 치킨인증 운영진 ✅ 반응 처리
 */
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    await handleChickenProofReaction(reaction, user);
  } catch (error) {
    console.error(
      '❌ [치킨인증] 반응 처리 오류:',
      error
    );
  }
});


/*
 * 구인글 직접 삭제 감지
 */
client.on('messageDelete', async (message) => {
  await handleRecruitmentMessageDelete(client, message);
});


client.login(token);
