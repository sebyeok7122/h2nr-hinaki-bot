
const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  createSetupSession
} = require('../../services/recruitSetupService');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('듀오구인')
    .setDescription(
      '듀오 구인을 생성합니다.'
    ),

  async execute(interaction) {
    /*
     * 먼저 개인 안내 메시지를 전송합니다.
     */
    await interaction.reply({
      content:
        '💕 **듀오 구인 설정**\n\n' +
        '👥 **함께할 멤버를 멘션해주세요!**\n\n' +
        '현재 구인 채널에 멤버를 한 번에 멘션해주세요.\n\n' +
        '예시: `@새벽 @상디`\n\n' +
        '✅ 듀오는 최대 **2명**까지 등록할 수 있어요.\n' +
        '✅ 파티장도 참여한다면 본인도 멘션해주세요.\n' +
        '✅ 멤버 등록 후 **듀오방 선택**으로 넘어갑니다.\n\n' +
        '⏰ **10분 안에 입력해주세요.**',

      flags: MessageFlags.Ephemeral,

      allowedMentions: {
        parse: []
      }
    });

    /*
     * 새로운 구인 설정 세션
     *
     * 멤버 멘션
     * → 듀오방 선택
     * → 파티 설명
     * → 구인 생성
     */
    createSetupSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,

      type: 'DUO',
      capacity: 2,
      voiceKind: 'DUO',

      channelId: interaction.channelId,
      sourceInteraction: interaction
    });

    console.log(
      `💕 [듀오구인] ${interaction.user.id} · 멤버 입력 대기`
    );
  }
};
