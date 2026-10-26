
const {
  SlashCommandBuilder,
  MessageFlags
} = require('discord.js');

const {
  createSetupSession
} = require('../services/recruitSetupService');


/*
 * 일반 / 경쟁 / 빡겜 구인 공통 명령어
 *
 * 새로운 생성 순서:
 * 1. 멤버 멘션 입력
 * 2. 음성방 선택
 * 3. 파티 설명 작성
 * 4. 구인 생성
 *
 * 시간 선택 및 멤버1~4 옵션 제거
 */
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
      /*
       * 먼저 디스코드에 응답합니다.
       * interaction 응답 지연 방지
       */
      await interaction.reply({
        content:
          `${title} **설정**\n\n` +
          '👥 **함께할 멤버를 멘션해주세요!**\n\n' +
          '지금 구인 채널에 함께할 멤버를 한 번에 멘션해주세요.\n\n' +
          '예시: `@새벽 @상디 @혜진`\n\n' +
          '✅ 멤버는 최대 **4명**까지 등록할 수 있습니다.\n' +
          '✅ 파티장도 참여한다면 본인을 함께 멘션해주세요.\n' +
          '✅ 멤버 입력 후 **음성방 선택**으로 넘어갑니다.\n\n' +
          '⏰ **10분 안에 입력해주세요.**',

        flags:
          MessageFlags.Ephemeral,

        allowedMentions: {
          parse: []
        }
      });

      /*
       * 현재 구인 설정 상태 저장
       *
       * 멤버 멘션을 감지할 때
       * 채널 / 사용자 / 구인 종류를 확인합니다.
       */
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
