
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

    /*
     * 게임명 입력은 유지
     */
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

    /*
     * 정원 선택은 유지
     */
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

    /*
     * 먼저 개인 안내 메시지를 전송합니다.
     */
    await interaction.reply({
      content:
        '🎮 **종겜 구인 설정**\n\n' +
        `🎲 게임: **${gameName}**\n` +
        `👥 정원: **${capacity}명**\n\n` +
        '👥 **함께할 멤버를 멘션해주세요!**\n\n' +
        '현재 구인 채널에 함께할 멤버를 한 번에 멘션해주세요.\n\n' +
        '예시: `@새벽 @상디 @혜진`\n\n' +
        `✅ 최대 **${capacity}명**까지 등록할 수 있어요.\n` +
        '✅ 파티장도 참여한다면 본인도 멘션해주세요.\n' +
        '✅ 멤버 입력 후 **종겜방 선택**으로 넘어갑니다.\n\n' +
        '⏰ **10분 안에 입력해주세요.**',

      flags: MessageFlags.Ephemeral,

      allowedMentions: {
        parse: []
      }
    });

    /*
     * 종겜 구인 설정 시작
     *
     * 멤버 직접 멘션
     * → 종겜방 선택
     * → 파티 설명
     * → 구인 생성
     */
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
