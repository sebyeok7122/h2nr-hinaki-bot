const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const {
  createSetupSession,
  updateSetupSession
} = require('../../services/recruitSetupService');

const {
  ROLE_IDS,
  RECRUIT_CONFIG
} = require('../../config/constants');


function buildHourOptions() {
  const options = [];

  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {
    const value =
      String(hour).padStart(
        2,
        '0'
      );

    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${value}시`)
        .setValue(value)
    );
  }

  return options;
}


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
              value: 'SQUAD',
            },
            {
              name: '💕 듀오 (2인)',
              value: 'DUO',
            }
          )
    )

    .addUserOption(
      (option) =>
        option
          .setName('멤버1')
          .setDescription(
            '현재 함께 있는 멤버'
          )
          .setRequired(true)
    )

    .addUserOption(
      (option) =>
        option
          .setName('멤버2')
          .setDescription(
            '현재 함께 있는 멤버'
          )
          .setRequired(false)
    )

    .addUserOption(
      (option) =>
        option
          .setName('멤버3')
          .setDescription(
            '현재 함께 있는 멤버'
          )
          .setRequired(false)
    )

    .addUserOption(
      (option) =>
        option
          .setName('멤버4')
          .setDescription(
            '현재 함께 있는 멤버'
          )
          .setRequired(false)
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


    const selectedUsers = [
      interaction.options.getUser(
        '멤버1',
        true
      ),

      interaction.options.getUser(
        '멤버2'
      ),

      interaction.options.getUser(
        '멤버3'
      ),

      interaction.options.getUser(
        '멤버4'
      ),
    ].filter(Boolean);


    const memberIds = [
      ...new Set(
        selectedUsers.map(
          (user) => user.id
        )
      ),
    ];


    if (
      memberIds.length >
      capacity
    ) {
      await interaction.reply({
        content:
          isDuo
            ? '💕 듀오 신입파티는 최대 2명까지 선택할 수 있어요!'
            : '🌱 스쿼드 신입파티는 최대 4명까지 선택할 수 있어요!',

        ephemeral: true,
      });

      return;
    }


    const newbieMemberIds = [];

    for (
      const userId of memberIds
    ) {
      const member =
        await interaction.guild.members.fetch(
          userId
        );

      if (
        member.roles.cache.has(
          ROLE_IDS.NEWBIE
        )
      ) {
        newbieMemberIds.push(
          userId
        );
      }
    }


    if (
      newbieMemberIds.length === 0
    ) {
      await interaction.reply({
        content:
          '🌱 신입 파티에는 신입 멤버가 최소 1명 포함되어야 해요!',

        ephemeral: true,
      });

      return;
    }


    createSetupSession({
      guildId:
        interaction.guildId,

      userId:
        interaction.user.id,

      type:
        'NEWBIE',

      capacity,

      voiceKind,
    });


    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        memberIds,
        newbieMemberIds,
      }
    );


    const mentions =
      memberIds
        .map(
          (id) => `<@${id}>`
        )
        .join(' ');


    const newbieMentions =
      newbieMemberIds
        .map(
          (id) => `<@${id}>`
        )
        .join(' ');


    const hourSelect =
      new StringSelectMenuBuilder()
        .setCustomId(
          'recruit_setup_hour'
        )
        .setPlaceholder(
          '시작 예정 시간을 선택해주세요'
        )
        .addOptions(
          buildHourOptions()
        );


    const row =
      new ActionRowBuilder()
        .addComponents(
          hourSelect
        );


    await interaction.reply({
      content:
        '🌱 **신입 파티 구해요! 설정**\n\n' +
        `🎮 파티 종류: **${partyLabel}**\n` +
        `👥 정원: **${capacity}명**\n` +
        `🌱 신입: ${newbieMentions}\n` +
        `✅ 현재 멤버: ${mentions}\n\n` +
        '② 시작 예정 **시간**을 선택해주세요.',

      components: [row],

      ephemeral: true,
    });
  },
};