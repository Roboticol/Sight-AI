import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder
} from "discord.js";
import { Command } from "../types/index.js";
import { levelingService } from "../services/levelingService.js";
import { isAuthorizedAdmin } from "../config.js";

export const levelRolesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("level-roles")
    .setDescription("Configure and view role rewards assigned at specific levels.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Assign a role to be automatically awarded at a specific level.")
        .addIntegerOption(opt =>
          opt
            .setName("level")
            .setDescription("The level required to unlock this role (e.g. 1, 5, 10, 50)")
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt
            .setName("role")
            .setDescription("The role to award")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("remove")
        .setDescription("Remove a role reward from a specific level.")
        .addIntegerOption(opt =>
          opt
            .setName("level")
            .setDescription("The level to remove the role reward from")
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("list")
        .setDescription("List all level-to-role mappings configured on this server.")
    )
    .addSubcommand(sub =>
      sub
        .setName("sync")
        .setDescription("Retroactively sync level roles for a member who already reached that level.")
        .addUserOption(opt =>
          opt
            .setName("user")
            .setDescription("The member to sync roles for (defaults to yourself)")
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
        content: "❌ You are not authorized to configure level roles. Only designated administrators can manage role rewards.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "set") {
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);

      // Check role hierarchy
      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
      let warning = "";
      if (botMember && botMember.roles.highest.position <= role.position) {
        warning = "\n\n⚠️ **Warning:** The role <@&" + role.id + "> is higher than or equal to my highest role (<@&" + botMember.roles.highest.id + ">). Please move my bot role higher in **Server Settings > Roles** so I can assign it to members!";
      }

      levelingService.setLevelRole(guildId, level, role.id);

      const embed = new EmbedBuilder()
        .setTitle("✅ Level Role Reward Set")
        .setColor(0x2ECC71)
        .setDescription("Members will now automatically receive <@&" + role.id + "> upon reaching **Level " + level + "**!" + warning);

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "remove") {
      const level = interaction.options.getInteger("level", true);
      const removed = levelingService.removeLevelRole(guildId, level);

      if (removed) {
        await interaction.reply({
          content: "✅ Removed role reward for **Level " + level + "**.",
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: "ℹ️ No role reward was found configured for **Level " + level + "**.",
          flags: MessageFlags.Ephemeral
        });
      }
      return;
    }

    if (subcommand === "list") {
      const roleRewards = levelingService.getLevelRoles(guildId);

      const embed = new EmbedBuilder()
        .setTitle("🎖️ " + interaction.guild.name + " Level Role Rewards")
        .setColor(0x5865F2)
        .setThumbnail(interaction.guild.iconURL() ?? null);

      if (roleRewards.length === 0) {
        embed.setDescription("No level roles configured yet!\nUse `/level-roles set level:<num> role:<role>` to set roles for levels (e.g. Level 1, Level 5, Level 10).");
      } else {
        const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
        const lines = roleRewards.map(reward => {
          const role = interaction.guild?.roles.cache.get(reward.role_id);
          const roleName = role ? "<@&" + role.id + ">" : "`Deleted Role (" + reward.role_id + ")`";
          let alert = "";
          if (role && botMember && botMember.roles.highest.position <= role.position) {
            alert = " ⚠️ *(Bot role is lower!)*";
          }
          return "• **Level " + reward.level + "** ➔ " + roleName + alert;
        });

        embed.setDescription(lines.join("\n\n"));
        embed.setFooter({ text: "Total Role Rewards: " + roleRewards.length });
      }

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === "sync") {
      const targetUser = interaction.options.getUser("user") ?? interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: "Could not find member in this server.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const rankStats = levelingService.getUserRank(guildId, targetUser.id);
      const eligibleRewards = levelingService.getEligibleRoles(guildId, rankStats.level);

      const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(() => null);
      const canManageRoles = botMember?.permissions.has(PermissionFlagsBits.ManageRoles);

      if (!canManageRoles) {
        await interaction.reply({
          content: "❌ I need the **Manage Roles** permission to assign roles.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const assigned: string[] = [];
      const failed: string[] = [];

      for (const reward of eligibleRewards) {
        const role = interaction.guild.roles.cache.get(reward.role_id) ?? await interaction.guild.roles.fetch(reward.role_id).catch(() => null);
        if (!role) continue;

        if (botMember && botMember.roles.highest.position <= role.position) {
          failed.push("<@&" + role.id + "> (role hierarchy too high)");
          continue;
        }

        if (!member.roles.cache.has(role.id)) {
          try {
            await member.roles.add(role.id);
            assigned.push("<@&" + role.id + ">");
          } catch (err) {
            failed.push("<@&" + role.id + ">");
          }
        }
      }

      let responseText = "🔄 **Sync Complete for <@" + targetUser.id + "> (Level " + rankStats.level + "):**\n";
      if (assigned.length > 0) {
        responseText += "• **Added Roles:** " + assigned.join(", ") + "\n";
      } else {
        responseText += "• No missing level roles needed to be added.\n";
      }

      if (failed.length > 0) {
        responseText += "• **Could not assign:** " + failed.join(", ") + "\n*(Check bot role hierarchy in Server Settings)*";
      }

      await interaction.reply({
        content: responseText,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
  }
};
