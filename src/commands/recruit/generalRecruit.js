const {
  SlashCommandBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder
} = require('discord.js');

const {
  createSetupSession
} = require('../../services/recruitSetupService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('일반구인')
    .setDescription(
      '일반게임 스쿼드 구인을 생성합니다.'
    ),

  async execute(interaction) {
    createSetupSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,

      type: 'GENERAL',
      capacity: 4,
      voiceKind: 'SQUAD',
    });

    const memberSelect =
      new UserSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_members'
        )
        .setPlaceholder(
          '현재 함께 있는 멤버를 선택해주세요'
        )
        .setMinValues(1)
        .setMaxValues(4);

    const row =
      new ActionRowBuilder()
        .addComponents(
          memberSelect
        );

    await interaction.reply({
      content:
        '🎮 **일반게임 구인 설정**\n\n' +
        '① 현재 함께 있는 멤버를 선택해주세요.\n' +
        '최대 **4명**까지 선택할 수 있어요.',
      components: [row],
      ephemeral: true,
    });
  },
};