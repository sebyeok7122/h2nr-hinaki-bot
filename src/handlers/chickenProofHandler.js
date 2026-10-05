const {
  ROLE_IDS,
  CHANNEL_IDS
} = require('../config/constants');

const {
  db
} = require('../database/db');

const {
  addPoints,
  promoteNewbieIfEligible
} = require('../services/pointService');


const CHECK_EMOJI =
  '✅';

const DISCORD_EPOCH =
  1420070400000n;

const KST_OFFSET_MS =
  9 * 60 * 60 * 1000;


/*
 * 같은 멤버가 여러 인증글에서 거의 동시에 승인될 때도
 * 하루 중복 지급이 생기지 않도록 처리 중인 멤버를 잠급니다.
 */
const processingUsers =
  new Set();


/*
 * 같은 치킨인증 게시물은 한 번만 처리합니다.
 */
const insertApproval =
  db.prepare(`
    INSERT OR IGNORE INTO chicken_proof_approvals (
      guild_id,
      channel_id,
      message_id,
      approved_by,
      status
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      'PROCESSING'
    )
  `);


const completeApproval =
  db.prepare(`
    UPDATE chicken_proof_approvals

    SET
      status = 'COMPLETED',
      completed_at = datetime('now')

    WHERE
      guild_id = ?
      AND message_id = ?
      AND status = 'PROCESSING'
  `);


const deleteProcessingApproval =
  db.prepare(`
    DELETE FROM chicken_proof_approvals

    WHERE
      guild_id = ?
      AND message_id = ?
      AND status = 'PROCESSING'
  `);


/*
 * 해당 멤버의 기존 치킨 포인트 기록을 가져옵니다.
 *
 * 자동 치킨인증:
 *   reference_id에 인증글 메시지 ID가 저장되어 있으므로
 *   메시지 작성 날짜를 기준으로 하루 중복을 판단합니다.
 *
 * 수동 지급:
 *   메시지 ID가 없으므로 기존처럼 지급 날짜를 기준으로 판단합니다.
 */
const selectChickenRewardHistory =
  db.prepare(`
    SELECT
      source,
      reference_type,
      reference_id,
      created_at

    FROM point_transactions

    WHERE
      guild_id = ?
      AND user_id = ?
      AND source IN (
        'CHICKEN_PROOF',
        'NEWBIE_CHICKEN'
      )

    ORDER BY id DESC
  `);


/*
 * UTC timestamp를 한국 날짜 YYYY-MM-DD로 바꿉니다.
 */
function getKstDateStringFromTimestamp(
  timestamp
) {
  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return null;
  }


  const kstDate =
    new Date(
      timestamp +
      KST_OFFSET_MS
    );


  if (
    Number.isNaN(
      kstDate.getTime()
    )
  ) {
    return null;
  }


  return kstDate
    .toISOString()
    .slice(
      0,
      10
    );
}


/*
 * 치킨 인증글이 작성된 한국 날짜를 가져옵니다.
 */
function getProofDateFromMessage(
  message
) {
  return getKstDateStringFromTimestamp(
    message.createdTimestamp
  );
}


/*
 * Discord 메시지 ID(Snowflake)에 들어 있는
 * 메시지 작성 시간을 한국 날짜로 변환합니다.
 */
function getProofDateFromReferenceId(
  referenceId
) {
  if (
    !referenceId ||
    !/^\d{17,20}$/.test(
      String(referenceId)
    )
  ) {
    return null;
  }


  try {
    const snowflake =
      BigInt(
        referenceId
      );


    const timestamp =
      Number(
        (
          snowflake >>
          22n
        ) +
        DISCORD_EPOCH
      );


    return getKstDateStringFromTimestamp(
      timestamp
    );

  } catch (error) {
    return null;
  }
}


/*
 * SQLite UTC created_at을 한국 날짜로 변환합니다.
 */
function getKstDateFromDatabaseTime(
  createdAt
) {
  if (
    !createdAt
  ) {
    return null;
  }


  const timestamp =
    new Date(
      createdAt.replace(
        ' ',
        'T'
      ) + 'Z'
    ).getTime();


  return getKstDateStringFromTimestamp(
    timestamp
  );
}


/*
 * 한 포인트 기록이 실제로 어느 날짜의
 * 치킨 인증인지 판단합니다.
 *
 * 자동 치킨인증이면:
 *   인증글 메시지 작성일
 *
 * 수동 지급이면:
 *   실제 지급일
 */
function getChickenRewardDate(
  transaction
) {
  if (
    transaction.reference_type ===
      'CHICKEN_PROOF'
  ) {
    const proofDate =
      getProofDateFromReferenceId(
        transaction.reference_id
      );


    if (
      proofDate
    ) {
      return proofDate;
    }
  }


  return getKstDateFromDatabaseTime(
    transaction.created_at
  );
}


/*
 * 해당 인증 날짜에 이미 치킨 포인트를
 * 받은 적이 있는지 확인합니다.
 */
function hasChickenRewardForDate(
  guildId,
  userId,
  proofDate
) {
  const history =
    selectChickenRewardHistory.all(
      guildId,
      userId
    );


  return history.some(
    (transaction) =>
      getChickenRewardDate(
        transaction
      ) ===
      proofDate
  );
}


/*
 * YYYY-MM-DD를 보기 좋은 한국 날짜로 바꿉니다.
 */
function formatProofDate(
  proofDate
) {
  const parts =
    String(
      proofDate || ''
    ).split(
      '-'
    );


  if (
    parts.length !== 3
  ) {
    return proofDate ||
      '해당 날짜';
  }


  return (
    `${Number(parts[1])}월 ` +
    `${Number(parts[2])}일`
  );
}


function hasImageAttachment(
  message
) {
  return message.attachments.some(
    (attachment) => {
      const contentType =
        attachment.contentType || '';


      if (
        contentType.startsWith(
          'image/'
        )
      ) {
        return true;
      }


      const name =
        attachment.name || '';


      return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(
        name
      );
    }
  );
}


async function fetchReactionMessage(
  reaction
) {
  try {
    if (
      reaction.partial
    ) {
      await reaction.fetch();
    }


    const message =
      reaction.message;


    if (
      message.partial
    ) {
      await message.fetch();
    }


    return message;

  } catch (error) {
    console.warn(
      '⚠️ [치킨인증] 반응 원본 메시지 불러오기 실패:',
      error.message
    );

    return null;
  }
}


async function fetchGuildMember(
  guild,
  userId
) {
  return (
    guild.members.cache.get(
      userId
    ) ||
    await guild.members.fetch(
      userId
    )
  );
}


function getMentionedUserIds(
  message,
  botUserId
) {
  return [
    ...new Set(
      [
        ...message.mentions.users.values(),
      ]
        .filter(
          (mentionedUser) =>
            mentionedUser.id !== botUserId &&
            !mentionedUser.bot
        )
        .map(
          (mentionedUser) =>
            mentionedUser.id
        )
    ),
  ];
}


async function sendInvalidProofMessage(
  message,
  reason
) {
  try {
    await message.reply({
      content:
        `❎ ${reason}`,

      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
    });

  } catch (error) {
    console.warn(
      '⚠️ [치킨인증] 인증 오류 안내 전송 실패:',
      error.message
    );
  }
}


async function sendResultMessage(
  message,
  results,
  proofDate
) {
  const displayDate =
    formatProofDate(
      proofDate
    );


  const lines = [
    '**🍗 오늘 저녁은 치킨이닭! 희낙이봇 포인트 적립!**',
    `📅 인증 기준일: **${displayDate}**`,
  ];


  for (
    const result of results
  ) {
    if (
      result.status === 'AWARDED'
    ) {
      lines.push(
        `<@${result.userId}> +${result.amount}P`
      );

      continue;
    }


    if (
      result.status === 'DUPLICATE'
    ) {
      lines.push(
        `<@${result.userId}> — ${displayDate} 이미 인증 완료`
      );

      continue;
    }


    lines.push(
      `<@${result.userId}> — 처리하지 못했어요`
    );
  }


  lines.push(
    '**🐶 치킨 포인트는 인증글 작성일 기준 하루 1번만 받을 수 있어요! 중복 언급은 자동 제외됩니다 🐶**'
  );


  await message.reply({
    content:
      lines.join('\n'),

    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  });
}


async function sendPromotionMessage(
  message,
  promotedUserIds
) {
  if (
    promotedUserIds.length === 0
  ) {
    return;
  }


  try {
    const mentions =
      promotedUserIds.map(
        (userId) =>
          `<@${userId}>`
      );


    await message.channel.send({
      content:
        `🎉 ${mentions.join(' ')}님이 **10P를 달성하여 신입에서 멤버로 승급**했어요!\n` +
        '희희낙락 정식 멤버가 되신 걸 축하드립니다 💛',

      allowedMentions: {
        users:
          promotedUserIds,
      },
    });

  } catch (error) {
    console.warn(
      '⚠️ [치킨인증] 자동등업 안내 전송 실패:',
      error.message
    );
  }
}


async function handleChickenProofReaction(
  reaction,
  user
) {
  if (
    user.bot ||
    reaction.emoji.name !==
      CHECK_EMOJI
  ) {
    return;
  }


  const message =
    await fetchReactionMessage(
      reaction
    );


  if (
    !message ||
    !message.guild ||
    message.channelId !==
      CHANNEL_IDS.CHICKEN_PROOF ||
    message.author?.bot
  ) {
    return;
  }


  let staffMember;


  try {
    staffMember =
      await fetchGuildMember(
        message.guild,
        user.id
      );

  } catch (error) {
    console.warn(
      `⚠️ [치킨인증] 반응한 멤버 확인 실패: ${user.id}`
    );

    return;
  }


  /*
   * 운영진 역할이 있는 사람의 ✅만 승인으로 인정합니다.
   */
  if (
    !staffMember.roles.cache.has(
      ROLE_IDS.STAFF
    )
  ) {
    return;
  }


  if (
    !hasImageAttachment(
      message
    )
  ) {
    await sendInvalidProofMessage(
      message,
      '치킨인증 자동 적립은 **사진 + 멤버 언급**이 함께 있어야 해요.'
    );

    return;
  }


  const userIds =
    getMentionedUserIds(
      message,
      reaction.client.user.id
    );


  if (
    userIds.length === 0
  ) {
    await sendInvalidProofMessage(
      message,
      '포인트를 받을 **멤버를 한 명 이상 언급**해주세요.'
    );

    return;
  }


  /*
   * 포인트 지급 날짜는
   * 운영진이 체크한 시간이 아니라
   * 인증글이 올라온 한국 날짜를 기준으로 합니다.
   */
  const proofDate =
    getProofDateFromMessage(
      message
    );


  if (
    !proofDate
  ) {
    await sendInvalidProofMessage(
      message,
      '인증글 작성 날짜를 확인하지 못했어요. 잠시 후 다시 시도해주세요.'
    );

    return;
  }


  /*
   * 게시물 자체 중복 승인 방지
   */
  const approvalResult =
    insertApproval.run(
      message.guildId,
      message.channelId,
      message.id,
      user.id
    );


  if (
    approvalResult.changes === 0
  ) {
    return;
  }


  const results = [];
  const promotedUserIds = [];


  try {
    /*
     * 포인트를 지급하기 전에
     * 언급된 모든 멤버의 역할부터 확인합니다.
     *
     * 한 사람이라도 정보를 불러오지 못하면
     * 신입 포함 여부를 잘못 판단할 수 있으므로
     * 아무에게도 포인트를 지급하지 않습니다.
     */
    const targetMembers =
      new Map();


    for (
      const userId of userIds
    ) {
      try {
        const targetMember =
          await fetchGuildMember(
            message.guild,
            userId
          );


        targetMembers.set(
          userId,
          targetMember
        );

      } catch (error) {
        deleteProcessingApproval.run(
          message.guildId,
          message.id
        );


        console.warn(
          `⚠️ [치킨인증] 지급 대상 멤버 확인 실패: ${userId}`
        );


        await sendInvalidProofMessage(
          message,
          '언급된 멤버 정보를 확인하지 못했어요. 잠시 후 다시 승인해주세요.'
        );


        return;
      }
    }


    /*
     * ★ 치킨 포인트 규칙
     *
     * 언급된 멤버 중 [신입] 역할이
     * 한 명이라도 있는지 먼저 확인합니다.
     *
     * 신입 없음:
     *   모든 멤버 +1P
     *
     * 신입 있음:
     *   신입 +1P
     *   기존 멤버 +2P
     */
    const hasNewbieInParty =
      userIds.some(
        (userId) =>
          targetMembers
            .get(userId)
            ?.roles.cache.has(
              ROLE_IDS.NEWBIE
            )
      );


    for (
      const userId of userIds
    ) {
      const lockKey =
        `${message.guildId}:${userId}`;


      /*
       * 다른 인증글이 같은 멤버를
       * 동시에 처리 중이면 중복으로 취급합니다.
       */
      if (
        processingUsers.has(
          lockKey
        )
      ) {
        results.push({
          userId,
          status:
            'DUPLICATE',
        });

        continue;
      }


      processingUsers.add(
        lockKey
      );


      try {
        /*
         * ★ 하루 1회 기준
         *
         * 운영진이 ✅ 누른 날짜가 아니라
         * 인증글 작성 날짜를 기준으로 확인합니다.
         */
        const alreadyRewarded =
          hasChickenRewardForDate(
            message.guildId,
            userId,
            proofDate
          );


        if (
          alreadyRewarded
        ) {
          results.push({
            userId,
            status:
              'DUPLICATE',
          });

          continue;
        }


        const targetMember =
          targetMembers.get(
            userId
          );


        const isNewbie =
          targetMember.roles.cache.has(
            ROLE_IDS.NEWBIE
          );


        let amount;
        let source;
        let description;


        /*
         * 신입이 포함된 파티
         */
        if (
          hasNewbieInParty
        ) {
          if (
            isNewbie
          ) {
            amount =
              1;

            source =
              'CHICKEN_PROOF';

            description =
              '치킨 인증';

          } else {
            amount =
              2;

            source =
              'NEWBIE_CHICKEN';

            description =
              '신입과 치킨 인증';
          }

        /*
         * 신입이 없는 일반 파티
         */
        } else {
          amount =
            1;

          source =
            'CHICKEN_PROOF';

          description =
            '치킨 인증';
        }


        const pointResult =
          addPoints({
            guildId:
              message.guildId,

            userId,

            amount,

            source,

            description,

            referenceType:
              'CHICKEN_PROOF',

            referenceId:
              message.id,

            createdBy:
              user.id,
          });


        if (
          pointResult.code !==
          'OK'
        ) {
          results.push({
            userId,
            status:
              'FAILED',
          });

          continue;
        }


        results.push({
          userId,
          status:
            'AWARDED',
          amount,
        });


        const promotionResult =
          await promoteNewbieIfEligible(
            message.guild,
            userId
          );


        if (
          promotionResult.code ===
          'PROMOTED'
        ) {
          promotedUserIds.push(
            userId
          );

        } else if (
          promotionResult.code ===
          'ROLE_UPDATE_FAILED'
        ) {
          console.error(
            `❌ [치킨인증] 자동등업 역할 변경 실패: ${userId}`,
            promotionResult.error
          );
        }

      } finally {
        processingUsers.delete(
          lockKey
        );
      }
    }


    completeApproval.run(
      message.guildId,
      message.id
    );


    try {
      await sendResultMessage(
        message,
        results,
        proofDate
      );

    } catch (error) {
      console.error(
        '❌ [치킨인증] 포인트 결과 메시지 전송 실패:',
        error
      );
    }


    await sendPromotionMessage(
      message,
      promotedUserIds
    );


    const awardedCount =
      results.filter(
        (result) =>
          result.status ===
            'AWARDED'
      ).length;


    const duplicateCount =
      results.filter(
        (result) =>
          result.status ===
            'DUPLICATE'
      ).length;


    console.log(
      `🍗 [치킨인증] 메시지 ${message.id} · 인증일 ${proofDate} · ` +
      `승인 ${user.username} · ` +
      `신입포함 ${hasNewbieInParty ? 'YES' : 'NO'} · ` +
      `지급 ${awardedCount}명 · 날짜중복 ${duplicateCount}명`
    );

  } catch (error) {
    /*
     * 처리 도중 예외가 발생하면 PROCESSING 기록을 지워
     * 운영진이 반응을 뗐다 다시 붙여 재시도할 수 있게 합니다.
     */
    deleteProcessingApproval.run(
      message.guildId,
      message.id
    );


    console.error(
      `❌ [치킨인증] 메시지 ${message.id} 처리 실패:`,
      error
    );
  }
}


module.exports = {
  handleChickenProofReaction,
};