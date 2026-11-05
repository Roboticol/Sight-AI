import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ChannelType
} from "discord.js";
import { Command } from "../types/index.js";
import { levelingService } from "../services/levelingService.js";
import { isAuthorizedAdmin } from "../config.js";

export const levelSetupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("level-setup")
    .setDescription("Configure the server's leveling system and exclusions.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // 1. settings subcommand
    .addSubcommand(sub =>
      sub
        .setName("settings")
        .setDescription("Configure leveling progression, anti-spam, and announcements.")
        .addIntegerOption(opt =>
          opt
            .setName("messages_per_level")
            .setDescription("Base messages needed for Level 1 (default: 5, scales to Level 50 like Arcane/MEE6)")
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(false)
        )
        .addNumberOption(opt =>
          opt
            .setName("multiplier")
            .setDescription("Progression scaling (1.0 = flat/linear, 1.25 = progressive)")
            .setMinValue(1.0)
            .setMaxValue(5.0)
            .setRequired(false)
        )
        .addIntegerOption(opt =>
          opt
            .setName("cooldown_seconds")
            .setDescription("Anti-spam cooldown between messages in seconds (e.g. 60, 0 = no cooldown)")
            .setMinValue(0)
            .setMaxValue(3600)
            .setRequired(false)
        )
        .addBooleanOption(opt =>
          opt
            .setName("exempt_owner")
            .setDescription("Whether to automatically exempt the server owner from leveling")
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt
            .setName("announcement_channel")
            .setDescription("Specific channel for level-up announcements")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("announcement_mode")
            .setDescription("Where to post level-up announcements")
            .addChoices(
              { name: "Current channel where user leveled up", value: "current" },
              { name: "Disable level-up announcements", value: "disabled" }
            )
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName("announcement_message")
            .setDescription("Custom message template ({user}, {level}, {messages})")
            .setRequired(false)
        )
    )
    // 2. exempt-user subcommand
    .addSubcommand(sub =>
      sub
        .setName("exempt-user")
        .setDescription("Add or remove a member from the leveling system.")
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Add or remove exemption")
            .setRequired(true)
            .addChoices(
              { name: "Add Exemption (exclude from leveling)", value: "add" },
              { name: "Remove Exemption (allow leveling)", value: "remove" }
            )
        )
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("The user to exempt or un-exempt")
            .setRequired(true)
        )
    )
    // 3. exempt-role subcommand
    .addSubcommand(sub =>
      sub
        .setName("exempt-role")
        .setDescription("Add or remove a role from the leveling system.")
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Add or remove exemption")
            .setRequired(true)
            .addChoices(
              { name: "Add Exemption", value: "add" },
              { name: "Remove Exemption", value: "remove" }
            )
        )
        .addRoleOption(opt =>
          opt
            .setName("role")
            .setDescription("The role to exempt or un-exempt")
            .setRequired(true)
        )
    )
    // 4. exempt-channel subcommand
    .addSubcommand(sub =>
      sub
        .setName("exempt-channel")
        .setDescription("Add or remove a channel from earning leveling XP.")
        .addStringOption(opt =>
          opt
            .setName("action")
            .setDescription("Add or remove exemption")
            .setRequired(true)
            .addChoices(
              { name: "Add Exemption", value: "add" },
              { name: "Remove Exemption", value: "remove" }
            )
        )
        .addChannelOption(opt =>
          opt
            .setName("channel")
            .setDescription("The channel to ignore for leveling")
            .setRequired(true)
        )
    )
    // 5. view subcommand
    .addSubcommand(sub =>
      sub
        .setName("view")
        .setDescription("View the server's current leveling settings and exclusions.")
    )
    // 6. set-user-level subcommand
    .addSubcommand(sub =>
      sub
        .setName("set-user-level")
        .setDescription("Manually set a user's level or messages.")
        .addUserOption(opt =>
          opt
            .setName("target")
            .setDescription("The user to modify")
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName("level")
            .setDescription("Target level")
            .setMinValue(0)
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName("messages")
            .setDescription("Total message count (optional, auto-calculated if omitted)")
            .setMinValue(0)
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used within a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!isAuthorizedAdmin(interaction.user.id)) {
      await interaction.reply({
        content: "❌ You are not authorized to use this administrative command. Only designated administrators can manage leveling settings.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "settings") {
      const messagesPerLevel = interaction.options.getInteger("messages_per_level");
      const multiplier = interaction.options.getNumber("multiplier");
      const cooldownSeconds = interaction.options.getInteger("cooldown_seconds");
      const exemptOwner = interaction.options.getBoolean("exempt_owner");
      const announcementChannel = interaction.options.getChannel("announcement_channel");
      const announcementMode = interaction.options.getString("announcement_mode");
      const announcementMessage = interaction.options.getString("announcement_message");

      const updates: Record<string, any> = {};
      if (messagesPerLevel !== null) updates.messages_per_level = messagesPerLevel;
      if (multiplier !== null) updates.scaling_multiplier = multiplier;
      if (cooldownSeconds !== null) updates.cooldown_seconds = cooldownSeconds;
      if (exemptOwner !== null) updates.exempt_owner = exemptOwner ? 1 : 0;
      if (announcementMode) {
        updates.level_up_channel = announcementMode;
      } else if (announcementChannel) {
        updates.level_up_channel = announcementChannel.id;
      }
      if (announcementMessage) updates.level_up_message = announcementMessage;

      const newSettings = levelingService.updateGuildSettings(guildId, updates);

      const embed = new EmbedBuilder()
        .setTitle("⚙️ Leveling Settings Updated")
        .setColor(0x2ECC71)
        .addFields(
          { name: "💬 Base Msgs to Level 1", value: String(newSettings.messages_per_level) + " msgs (~" + (Math.round(100 / newSettings.messages_per_level)) + " XP/msg)", inline: true },
          { name: "📈 Scaling Multiplier", value: newSettings.scaling_multiplier + "x", inline: true },
          { name: "⏱️ Message Cooldown", value: newSettings.cooldown_seconds + " seconds", inline: true },
          { name: "👑 Exempt Server Owner", value: newSettings.exempt_owner === 1 ? "Enabled (Owner excluded)" : "Disabled", inline: true },
          {
            name: "📢 Level-Up Announcement Channel",
            value: newSettings.level_up_channel === "disabled"
              ? "Disabled"
              : newSettings.level_up_channel === "current"
                ? "Current Channel"
                : "<#" + newSettings.level_up_channel + ">",
            inline: true
          },
          { name: "📝 Level-Up Message Template", value: "`" + newSettings.level_up_message + "`" }
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "exempt-user") {
      const action = interaction.options.getString("action", true);
      const targetUser = interaction.options.getUser("target", true);

      if (action === "add") {
        levelingService.addExemption(guildId, targetUser.id, "user");
        await interaction.reply({
          content: "✅ <@" + targetUser.id + "> has been **exempted** from the leveling system and will not earn XP.",
          flags: MessageFlags.Ephemeral
        });
      } else {
        const removed = levelingService.removeExemption(guildId, targetUser.id);
        await interaction.reply({
          content: removed
            ? "✅ <@" + targetUser.id + "> is no longer exempt and can now earn leveling XP."
            : "ℹ️ <@" + targetUser.id + "> was not in the exemption list.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (subcommand === "exempt-role") {
      const action = interaction.options.getString("action", true);
      const role = interaction.options.getRole("role", true);

      if (action === "add") {
        levelingService.addExemption(guildId, role.id, "role");
        await interaction.reply({
          content: "✅ Role <@&" + role.id + "> has been **exempted** from the leveling system.",
          flags: MessageFlags.Ephemeral
        });
      } else {
        const removed = levelingService.removeExemption(guildId, role.id);
        await interaction.reply({
          content: removed
            ? "✅ Role <@&" + role.id + "> is no longer exempt."
            : "ℹ️ Role <@&" + role.id + "> was not in the exemption list.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (subcommand === "exempt-channel") {
      const action = interaction.options.getString("action", true);
      const channel = interaction.options.getChannel("channel", true);

      if (action === "add") {
        levelingService.addExemption(guildId, channel.id, "channel");
        await interaction.reply({
          content: "✅ Channel <#" + channel.id + "> has been **exempted**. Messages sent there will not count towards leveling.",
          flags: MessageFlags.Ephemeral
        });
      } else {
        const removed = levelingService.removeExemption(guildId, channel.id);
        await interaction.reply({
          content: removed
            ? "✅ Channel <#" + channel.id + "> is no longer exempt."
            : "ℹ️ Channel <#" + channel.id + "> was not in the exemption list.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (subcommand === "view") {
      const settings = levelingService.getGuildSettings(guildId);
      const exemptions = levelingService.getExemptions(guildId);

      const userExemptions = exemptions.filter(e => e.target_type === "user").map(e => "<@" + e.target_id + ">");
      const roleExemptions = exemptions.filter(e => e.target_type === "role").map(e => "<@&" + e.target_id + ">");
      const channelExemptions = exemptions.filter(e => e.target_type === "channel").map(e => "<#" + e.target_id + ">");

      const embed = new EmbedBuilder()
        .setTitle("⚙️ " + interaction.guild.name + " Leveling Configuration")
        .setColor(0x5865F2)
        .addFields(
          { name: "💬 Base Msgs to Level 1", value: String(settings.messages_per_level) + " msgs (~" + (Math.round(100 / settings.messages_per_level)) + " XP/msg)", inline: true },
          { name: "📈 Scaling Multiplier", value: settings.scaling_multiplier + "x", inline: true },
          { name: "⏱️ Anti-Spam Cooldown", value: settings.cooldown_seconds + "s", inline: true },
          { name: "👑 Exempt Server Owner", value: settings.exempt_owner === 1 ? "✅ Yes (Excluded)" : "❌ No", inline: true },
          {
            name: "📢 Announcement Channel",
            value: settings.level_up_channel === "disabled"
              ? "Disabled"
              : settings.level_up_channel === "current"
                ? "Current Channel"
                : "<#" + settings.level_up_channel + ">",
            inline: true
          },
          { name: "📝 Announcement Template", value: "`" + settings.level_up_message + "`" },
          {
            name: "🚫 Exempt Users (" + userExemptions.length + ")",
            value: userExemptions.length > 0 ? userExemptions.join(", ") : "None"
          },
          {
            name: "🚫 Exempt Roles (" + roleExemptions.length + ")",
            value: roleExemptions.length > 0 ? roleExemptions.join(", ") : "None"
          },
          {
            name: "🚫 Exempt Channels (" + channelExemptions.length + ")",
            value: channelExemptions.length > 0 ? channelExemptions.join(", ") : "None"
          }
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "set-user-level") {
      const targetUser = interaction.options.getUser("target", true);
      const level = interaction.options.getInteger("level", true);
      const messages = interaction.options.getInteger("messages") ?? undefined;

      const result = levelingService.setUserLevel(guildId, targetUser.id, level, messages);

      await interaction.reply({
        content: "✅ Successfully set <@" + targetUser.id + ">'s level to **Level " + result.level + "** (" + result.totalMessages + " messages).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }
};
