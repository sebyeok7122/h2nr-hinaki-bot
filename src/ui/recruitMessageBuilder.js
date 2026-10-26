
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');


const TYPE_META = {
  GENERAL: {
    title: '🎮 일반게임 구인',
    fullTitle: '✅ 모집 완료'
  },

  RANKED: {
    title: '🏆 경쟁전 구인',
    fullTitle: '✅ 경쟁전 모집 완료'
  },

  GENERAL_HARD: {
    title: '🔥 일반 빡겜 구인',
    fullTitle: '✅ 일반 빡겜 모집 완료'
  },

  RANKED_HARD: {
    title: '🔥🏆 경쟁 빡겜 구인',
    fullTitle: '✅ 경쟁 빡겜 모집 완료'
  },

  NEWBIE: {
    title: '🌱 신입 파티 구해요!',
    fullTitle: '🌱 신입 파티 모집 완료!'
  },

  DUO: {
    title: '💕 듀오 구인',
    fullTitle: '✅ 듀오 모집 완료!'
  },

  OTHER_GAME: {
    title: '🎮 종겜 구인',
    fullTitle: '✅ 종겜 모집 완료!'
  },

  MERCENARY: {
    title: '🪖 용병 구인',
    fullTitle: '✅ 용병 모집 완료!'
  }
};


const VOICE_KIND_LABELS = {
  SQUAD: '스쿼드',
  DUO: '듀오',
  OTHER_GAME: '종겜',
  MERCENARY: '용병'
};


const QUEUE_NUMBER_EMOJIS = [
  '1️⃣',
  '2️⃣',
  '3️⃣',
  '4️⃣',
  '5️⃣',
  '6️⃣',
  '7️⃣',
  '8️⃣',
  '9️⃣',
  '🔟'
];


function getMentionList(memberIds) {
  return (memberIds || [])
    .map((id) => `<@${id}>`)
    .join(' ');
}


function getRecruitmentTitle(recruitment, isFull) {
  if (
    recruitment.type === 'OTHER_GAME' &&
    recruitment.game_name
  ) {
    return isFull
      ? '✅ 종겜 모집 완료! · ' + recruitment.game_name
      : '🎮 종겜종류 : ' + recruitment.game_name;
  }

  const meta =
    TYPE_META[recruitment.type] ||
    TYPE_META.GENERAL;

  return isFull ? meta.fullTitle : meta.title;
}


function getVoiceRoomLabel(recruitment) {
  const label =
    VOICE_KIND_LABELS[recruitment.voice_kind] ||
    '스쿼드';

  return `${label} ${recruitment.voice_room_number}번방`;
}


/*
 * 작성자가 직접 입력한 파티 설명
 */
function addPartyDescription(lines, recruitment) {
  const description =
    recruitment.description?.trim();

  if (!description) return;

  lines.push(
    '',
    '📝 **파티 설명**',
    description
  );
}


/*
 * 자리알림 대기순번 표시
 *
 * 기존 우선순위 / 대기시간 기능 유지
 */
function addWatcherQueue(lines, snapshot) {
  const watcherQueue =
    snapshot.watcherQueue || [];

  if (watcherQueue.length === 0) {
    return;
  }

  lines.push(
    '',
    '🔔 **자리 대기**'
  );

  const visibleQueue =
    watcherQueue.slice(0, 10);

  for (
    let index = 0;
    index < visibleQueue.length;
    index++
  ) {
    const watcher =
      visibleQueue[index];

    const number =
      QUEUE_NUMBER_EMOJIS[index] ||
      `${index + 1}.`;

    const priorityText =
      watcher.hasPriority
        ? ' ⏳ **우선 참여 중**'
        : '';

    lines.push(
      `${number} <@${watcher.userId}>${priorityText}`
    );
  }

  if (watcherQueue.length > 10) {
    lines.push(
      `… 외 ${watcherQueue.length - 10}명 대기 중`
    );
  }
}


/*
 * 신입파티 전용 표시
 *
 * 기존 신입 표시 / 자리알림 유지
 * 시작 예정 시간 표시는 제거
 */
function buildNewbieDescription(snapshot) {
  const {
    recruitment,
    memberIds,
    newbieMemberIds,
    memberCount,
    remaining,
    isFull
  } = snapshot;

  const lines = [
    `🔊 **${getVoiceRoomLabel(recruitment)}**`,
    `👥 현재 인원 **${memberCount} / ${recruitment.capacity}${isFull ? ' FULL' : ''}**`
  ];

  if (isFull) {
    lines.push(
      `👤 ${getMentionList(memberIds)}`
    );

  } else {
    const newbieMentions =
      newbieMemberIds.length > 0
        ? getMentionList(newbieMemberIds)
        : '현재 신입 없음';

    lines.push(
      `🌱 신입 ${newbieMentions}`,
      `➕ **${remaining}명 모집 중**`
    );
  }

  addWatcherQueue(lines, snapshot);
  addPartyDescription(lines, recruitment);

  lines.push(
    '',
    '⏳ **등록 후 3시간 자동 종료**'
  );

  if (isFull) {
    lines.push(
      '✅ 모집이 완료되었습니다!'
    );

  } else {
    lines.push(
      '',
      '처음 같이 하는 분들도 부담 없이 참여해주세요!'
    );
  }

  return lines.join('\n');
}


/*
 * 일반 / 경쟁 / 빡겜 / 듀오 / 종겜 / 용병
 *
 * 기존 표시 유지
 * 시작 예정 시간 표시는 제거
 */
function buildNormalDescription(snapshot) {
  const {
    recruitment,
    memberIds,
    memberCount,
    remaining,
    isFull
  } = snapshot;

  const lines = [
    `🔊 **${getVoiceRoomLabel(recruitment)}**`,
    `👥 현재 인원 **${memberCount} / ${recruitment.capacity}${isFull ? ' FULL' : ''}**`,
    `👤 ${getMentionList(memberIds)}`
  ];

  addWatcherQueue(lines, snapshot);
  addPartyDescription(lines, recruitment);

  if (recruitment.type === 'MERCENARY') {
    lines.push(
      '',
      '※ 용병 역할 보유자가 최소 1명 포함되어야 합니다.'
    );
  }

  lines.push(
    '',
    '⏳ **등록 후 3시간 자동 종료**',
    '',
    isFull
      ? '✅ 모집이 완료되었습니다!'
      : `🔎 **${remaining}자리 모집 중**`
  );

  return lines.join('\n');
}


/*
 * 실제 구인 메시지 생성
 *
 * 버튼 기능은 기존과 동일합니다.
 */
function buildRecruitmentMessage(
  snapshot,
  {
    pingHere = false
  } = {}
) {
  const {
    recruitment,
    isFull
  } = snapshot;

  const description =
    recruitment.type === 'NEWBIE'
      ? buildNewbieDescription(snapshot)
      : buildNormalDescription(snapshot);

  const embed = new EmbedBuilder()
    .setTitle(
      getRecruitmentTitle(
        recruitment,
        isFull
      )
    )
    .setDescription(description);

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `recruit_join:${recruitment.id}`
        )
        .setLabel('참여')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isFull),

      new ButtonBuilder()
        .setCustomId(
          `recruit_cancel:${recruitment.id}`
        )
        .setLabel('취소')
        .setEmoji('❎')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          `recruit_notify:${recruitment.id}`
        )
        .setLabel('자리나면 알림')
        .setEmoji('🔔')
        .setStyle(ButtonStyle.Secondary)
    );

  return {
    /*
     * 새 구인글 등록 때만 @here
     * 참여 / 취소로 수정할 때는 다시 멘션하지 않습니다.
     */
    content: pingHere ? '@here' : '',

    embeds: [embed],
    components: [buttons],

    allowedMentions: {
      parse: pingHere
        ? ['everyone']
        : []
    }
  };
}


module.exports = {
  buildRecruitmentMessage,
  getRecruitmentTitle,
  getVoiceRoomLabel,
  getMentionList
};