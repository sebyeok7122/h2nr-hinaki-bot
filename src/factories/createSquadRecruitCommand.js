
const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  createSetupSession
} = require('../services/recruitSetupService');


function createSquadRecruitCommand({
  name,
  description,
  type,
  title
}) {
  return {
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description),

    async execute(interaction) {
      await interaction.reply({
        content:
          `${title} **설정**\n\n` +

          '① 지금 보고 계신 **구인 채널의 채팅 입력창**을 눌러주세요.\n' +
          '② 함께할 멤버를 `@멘션` 후 **Enter를 눌러 메시지를 전송**하면 끝!\n' +
          '📝 예시: @상디 @새벽 @홍이\n\n' +

          '✅ 최대 4명까지 등록 가능 파티장도 참여한다면 본인 포함\n' +
          '✅ 멘션 전송 후 **자동으로 방 선택 화면으로 이동**\n\n' +

          '⏰ **10분 안에 입력해주세요!**',

        flags:
          MessageFlags.Ephemeral,

        allowedMentions: {
          parse: []
        }
      });

      createSetupSession({
        guildId:
          interaction.guildId,

        userId:
          interaction.user.id,

        type,

        capacity:
          4,

        voiceKind:
          'SQUAD',

        channelId:
          interaction.channelId,

        sourceInteraction:
          interaction
      });

      console.log(
        `🎮 [구인설정] ${interaction.user.id} · ${name} · 멤버 입력 대기`
      );
    }
  };
}


module.exports = {
  createSquadRecruitCommand
};