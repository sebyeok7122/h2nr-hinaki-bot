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
    await interaction.reply({
      content:
        '🪖 **용병 구인 설정**\n\n' +

        '① 지금 보고 계신 **구인 채널의 채팅 입력창**을 눌러주세요.\n' +
        '② 함께할 멤버를 `@멘션` 후 **Enter를 눌러 메시지를 전송**하면 끝!\n' +
        '📝 예시: @상디 @새벽 @용병\n\n' +

        '✅ 최대 4명까지 등록 가능 파티장도 참여한다면 본인 포함\n' +
        '✅ **용병 역할을 가진 멤버 최소 1명 포함 필수**\n' +
        '✅ 멘션 전송 후 **자동으로 방 선택 화면으로 이동**\n\n' +

        '⏰ **10분 안에 입력해주세요!**',

      flags: MessageFlags.Ephemeral,

      allowedMentions: {
        parse: []
      }
    });

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
