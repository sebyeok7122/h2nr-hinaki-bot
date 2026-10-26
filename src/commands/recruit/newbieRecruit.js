
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
    .setName('신입파티구해요')
    .setDescription(
      '신입과 함께하는 파티 구인을 생성합니다.'
    )

    /*
     * 스쿼드 / 듀오 선택은 유지합니다.
     */
    .addStringOption(
      (option) =>
        option
          .setName('파티종류')
          .setDescription(
            '스쿼드 또는 듀오를 선택해주세요'
          )
          .setRequired(true)
          .addChoices(
            {
              name: '🌱 스쿼드 (4인)',
              value: 'SQUAD'
            },
            {
              name: '💕 듀오 (2인)',
              value: 'DUO'
            }
          )
    ),


  async execute(interaction) {
    const partyType =
      interaction.options.getString(
        '파티종류',
        true
      );

    const isDuo =
      partyType === 'DUO';

    const capacity =
      isDuo
        ? RECRUIT_CONFIG.DUO_CAPACITY
        : RECRUIT_CONFIG.SQUAD_CAPACITY;

    const voiceKind =
      isDuo
        ? 'DUO'
        : 'SQUAD';

    const partyLabel =
      isDuo
        ? '💕 듀오'
        : '🌱 스쿼드';


    /*
     * 먼저 Discord interaction에 응답합니다.
     * Unknown interaction 오류 방지
     */
    await interaction.reply({
      content:
        '🌱 **신입 파티 구해요! 설정**\n\n' +
        `🎮 파티 종류: **${partyLabel}**\n` +
        `👥 정원: **${capacity}명**\n\n` +
        '👥 **함께할 멤버를 멘션해주세요!**\n\n' +
        '현재 구인 채널에서 멤버를 한 번에 멘션해주세요.\n\n' +
        (
          isDuo
            ? '예시: `@새벽 @신입`\n\n'
            : '예시: `@새벽 @상디 @혜진 @신입`\n\n'
        ) +
        '✅ **신입 역할을 가진 멤버가 최소 1명 필요해요.**\n' +
        '✅ 파티장도 참여한다면 본인을 함께 멘션해주세요.\n' +
        '✅ 멤버 입력 후 음성방 선택으로 넘어갑니다.\n\n' +
        '⏰ **10분 안에 입력해주세요.**',

      flags:
        MessageFlags.Ephemeral,

      allowedMentions: {
        parse: []
      }
    });


    /*
     * 신입파티 구인 설정 시작
     *
     * 멤버 멘션
     * → 신입 역할 확인
     * → 음성방 선택
     * → 파티 설명
     * → 생성
     */
    createSetupSession({
      guildId:
        interaction.guildId,

      userId:
        interaction.user.id,

      type:
        'NEWBIE',

      capacity,

      voiceKind,

      channelId:
        interaction.channelId,

      sourceInteraction:
        interaction
    });


    console.log(
      `🌱 [신입파티] ${interaction.user.id} · ${partyLabel} · 멤버 입력 대기`
    );
  }
};
