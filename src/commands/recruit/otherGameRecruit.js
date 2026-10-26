
const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  createSetupSession
} = require('../../services/recruitSetupService');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('종겜구인')
    .setDescription(
      '종합게임 구인을 생성합니다.'
    )

    .addStringOption(
      (option) =>
        option
          .setName('게임명')
          .setDescription(
            '플레이할 게임 이름'
          )
          .setRequired(true)
          .setMaxLength(50)
    )

    .addIntegerOption(
      (option) =>
        option
          .setName('정원')
          .setDescription(
            '모집 정원을 선택해주세요.'
          )
          .setRequired(true)
          .addChoices(
            { name: '2명', value: 2 },
            { name: '3명', value: 3 },
            { name: '4명', value: 4 },
            { name: '5명', value: 5 },
            { name: '6명', value: 6 },
            { name: '7명', value: 7 },
            { name: '8명', value: 8 },
            { name: '9명', value: 9 },
            { name: '10명', value: 10 }
          )
    ),

  async execute(interaction) {
    const gameName =
      interaction.options
        .getString('게임명', true)
        .trim();

    const capacity =
      interaction.options
        .getInteger('정원', true);

    await interaction.reply({
      content:
        '🎮 **종겜 구인 설정**\n' +
        `🎲 게임: **${gameName}**\n` +
        `👥 정원: **${capacity}명**\n\n` +

        '① 지금 보고 계신 **구인 채널의 채팅 입력창**을 눌러주세요.\n' +
        '② 함께할 멤버를 `@멘션` 후 **Enter를 눌러 메시지를 전송**하면 끝!\n' +
        '📝 예시: @상디 @새벽 @홍이\n\n' +

        `✅ 최대 ${capacity}명까지 등록 가능 파티장도 참여한다면 본인 포함\n` +
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

      type: 'OTHER_GAME',
      capacity,
      voiceKind: 'OTHER_GAME',

      gameName,

      channelId: interaction.channelId,
      sourceInteraction: interaction
    });

    console.log(
      `🎮 [종겜구인] ${interaction.user.id} · ${gameName} · 정원 ${capacity}명 · 멤버 입력 대기`
    );
  }
};
