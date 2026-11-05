import { Events, Message, EmbedBuilder, ChannelType, TextChannel, PermissionFlagsBits } from "discord.js";
import { BotEvent } from "../types/index.js";
import { levelingService } from "../services/levelingService.js";
import { couponService } from "../services/couponService.js";

export const messageCreateEvent: BotEvent<Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (message.author.bot) return;
    if (!message.guild || !message.member) return;

    const roleIds = message.member.roles.cache.map(r => r.id);
    const result = levelingService.processMessage(
      message.guild.id,
      message.author.id,
      message.channel.id,
      roleIds,
      message.guild.ownerId
    );

    if (result && result.leveledUp) {
      // 1. Role rewards
      const earnedRoles = levelingService.getNewRolesEarned(message.guild.id, result.oldLevel, result.newLevel);
      const assignedRoles: string[] = [];

      if (earnedRoles.length > 0) {
        const botMember = message.guild.members.me ?? await message.guild.members.fetchMe().catch(() => null);
        const canManageRoles = botMember?.permissions.has(PermissionFlagsBits.ManageRoles);

        for (const reward of earnedRoles) {
          const role = message.guild.roles.cache.get(reward.role_id) ?? await message.guild.roles.fetch(reward.role_id).catch(() => null);
          if (!role) continue;

          if (!canManageRoles) {
            console.warn("[Leveling] Bot lacks ManageRoles permission in guild " + message.guild.id);
            break;
          }

          if (botMember && botMember.roles.highest.position <= role.position) {
            console.warn("[Leveling] Role " + role.name + " is higher than bot's highest role in guild " + message.guild.id);
            continue;
          }

          try {
            if (!message.member.roles.cache.has(role.id)) {
              await message.member.roles.add(role.id);
              assignedRoles.push(role.id);
            }
          } catch (err) {
            console.error("[Leveling] Error assigning role " + role.id + ":", err);
          }
        }
      }

      // 2. Coupon milestone rewards
      // If no coupons can be distributed, absolutely no coupon message or DM is sent.
      const rewardLevels = couponService.getRewardLevels(message.guild.id);
      let couponDelivered = false;
      let couponDmFailed = false;

      for (const milestone of rewardLevels) {
        if (result.newLevel >= milestone && result.oldLevel < milestone) {
          if (!couponService.hasUserClaimedLevel(message.guild.id, message.author.id, milestone)) {
            const claimed = couponService.claimRandomCoupon(message.guild.id, message.author.id, milestone);

            // Only proceed if a coupon was successfully claimed from the pool
            if (claimed) {
              try {
                const dmEmbed = new EmbedBuilder()
                  .setTitle("🎁 Exclusive Level Reward Unlocked!")
                  .setColor(0xE91E63)
                  .setDescription(
                    "Congratulations **" + message.author.username + "**! You reached **Level " + milestone + "** in **" + message.guild.name + "**!\n\n" +
                    "Here is your exclusive, one-time-use coupon code:\n\n" +
                    "```\n" + claimed.plainCode + "\n```\n" +
                    (claimed.description ? "*Note: " + claimed.description + "*\n\n" : "") +
                    "⚠️ *Please save this code securely. It is one-time only and unique to you.*"
                  )
                  .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
                  .setTimestamp();

                await message.author.send({ embeds: [dmEmbed] });
                couponDelivered = true;
              } catch (dmErr) {
                console.warn("[Coupon] Could not DM user " + message.author.id + ". DMs may be closed.");
                couponDmFailed = true;
              }
            }
            // If claimed is null (no coupons available), do nothing and send no message.
          }
        }
      }

      const settings = levelingService.getGuildSettings(message.guild.id);

      if (settings.level_up_channel === "disabled") {
        return;
      }

      let targetChannel = message.channel;
      if (settings.level_up_channel !== "current") {
        try {
          const customChannel = await message.guild.channels.fetch(settings.level_up_channel);
          if (customChannel && (customChannel.type === ChannelType.GuildText || customChannel.type === ChannelType.GuildAnnouncement)) {
            targetChannel = customChannel as TextChannel;
          }
        } catch (err) {
          console.warn("[Leveling] Could not fetch configured level-up channel, falling back to current channel.");
        }
      }

      let formattedMessage = settings.level_up_message
        .split("{user}").join("<@" + message.author.id + ">")
        .split("{level}").join(String(result.newLevel))
        .split("{messages}").join(String(result.totalMessages));

      if (assignedRoles.length > 0) {
        const roleMentions = assignedRoles.map(id => "<@&" + id + ">").join(", ");
        formattedMessage += "\n\n🎖️ **Role Reward Unlocked:** " + roleMentions;
      }

      // Only display coupon notice if a coupon was actually awarded and distributed
      if (couponDelivered) {
        formattedMessage += "\n\n🎁 **Coupon Unlocked:** A secret coupon reward has been sent to your DMs!";
      } else if (couponDmFailed) {
        formattedMessage += "\n\n🎁 **Coupon Unlocked:** You earned a coupon code! Your DMs appear closed—use `/my-coupons` to view your code.";
      }

      const embed = new EmbedBuilder()
        .setTitle("🎉 Level Up!")
        .setDescription(formattedMessage)
        .setColor(0xF1C40F)
        .setThumbnail(message.author.displayAvatarURL())
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() ?? undefined })
        .setTimestamp();

      if ("send" in targetChannel && typeof targetChannel.send === "function") {
        await (targetChannel as TextChannel).send({
          content: "<@" + message.author.id + ">",
          embeds: [embed]
        }).catch(err => {
          console.error("[Leveling] Error sending level-up message:", err);
        });
      }
    }
  }
};
