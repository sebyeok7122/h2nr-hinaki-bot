
const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  createSetupSession
} = require('../../services/recruitSetupService');

const {
  RECRUIT_CONFIG
} = require('../../config/constants');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('용병구인')
    .setDescription(
      '용병과 함께하는 스쿼드 구인을 생성합니다.'
    ),

  async execute(interaction) {
    /*
     * 먼저 Discord interaction에 응답
     */
    await interaction.reply({
      content:
        '🪖 **용병 구인 설정**\n\n' +
        '👥 **함께할 멤버를 멘션해주세요!**\n\n' +
        '현재 구인 채널에서 멤버를 한 번에 멘션해주세요.\n\n' +
        '예시: `@새벽 @상디 @용병`\n\n' +
        '✅ 최대 **4명**까지 등록할 수 있어요.\n' +
        '✅ **용병 역할을 가진 멤버가 최소 1명 필요해요.**\n' +
        '✅ 파티장도 참여한다면 본인도 멘션해주세요.\n' +
        '✅ 멤버 입력 후 **용병방 선택**으로 넘어갑니다.\n\n' +
        '⏰ **10분 안에 입력해주세요.**',

      flags: MessageFlags.Ephemeral,

      allowedMentions: {
        parse: []
      }
    });

    /*
     * 용병구인 설정 시작
     *
     * 멤버 직접 멘션
     * → 용병 역할 확인
     * → 용병방 선택
     * → 파티 설명
     * → 구인 생성
     */
    createSetupSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,

      type: 'MERCENARY',
      capacity: RECRUIT_CONFIG.MERCENARY_CAPACITY,
      voiceKind: 'MERCENARY',

      channelId: interaction.channelId,
      sourceInteraction: interaction
    });

    console.log(
      `🪖 [용병구인] ${interaction.user.id} · 멤버 입력 대기`
    );
  }
};
