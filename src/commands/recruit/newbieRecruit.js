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
      isDuo ? 'DUO' : 'SQUAD';

    const partyLabel =
      isDuo ? '💕 듀오' : '🌱 스쿼드';


    await interaction.reply({
      content:
        '🌱 **신입 파티 구인 설정**\n' +
        `🎮 파티 종류: **${partyLabel}**\n\n` +

        '① 지금 보고 계신 **구인 채널의 채팅 입력창**을 눌러주세요.\n' +
        '② 함께할 멤버를 `@멘션` 후 **Enter를 눌러 메시지를 전송**하면 끝!\n' +
        (
          isDuo
            ? '📝 예시: @상디 @신입\n\n'
            : '📝 예시: @상디 @새벽 @홍이 @신입\n\n'
        ) +

        `✅ 최대 ${capacity}명까지 등록 가능 파티장도 참여한다면 본인 포함\n` +
        '✅ **신입 역할을 가진 멤버 최소 1명 포함 필수**\n' +
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

      type: 'NEWBIE',
      capacity,
      voiceKind,

      channelId: interaction.channelId,
      sourceInteraction: interaction
    });


    console.log(
      `🌱 [신입파티] ${interaction.user.id} · ${partyLabel} · 멤버 입력 대기`
    );
  }
};