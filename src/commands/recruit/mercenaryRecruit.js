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
  ROLE_IDS
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
    .setName('용병구인')
    .setDescription(
      '용병과 함께하는 스쿼드 구인을 생성합니다.'
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


    let hasMercenary = false;

    for (
      const userId of memberIds
    ) {
      const member =
        await interaction.guild.members.fetch(
          userId
        );

      if (
        member.roles.cache.has(
          ROLE_IDS.MERCENARY
        )
      ) {
        hasMercenary = true;
        break;
      }
    }


    if (!hasMercenary) {
      await interaction.reply({
        content:
          '⚠️ **용병이 포함되어 있지 않습니다** ⚠️\n\n' +
          '용병구인은 용병 역할을 가진 멤버가 최소 1명 포함되어야 생성할 수 있어요.\n' +
          '용병을 포함한 뒤 다시 생성해주세요!',

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
        'MERCENARY',

      capacity:
        4,

      voiceKind:
        'MERCENARY',
    });


    updateSetupSession(
      interaction.guildId,
      interaction.user.id,
      {
        memberIds,
      }
    );


    const mentions =
      memberIds
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
        '🪖 **용병 구인 설정**\n\n' +
        `✅ 현재 멤버: ${mentions}\n` +
        '✅ 용병 역할 확인 완료\n\n' +
        '② 시작 예정 **시간**을 선택해주세요.',

      components: [row],

      ephemeral: true,
    });
  },
};