/* The module order used by build.py. Tests import this so that adding a
   module cannot silently leave a console unrendered in the suite. */
module.exports = [
  'data.js','data6.js','inventory_data.js','core.js','access_rules.js','media6.js','media_portal.js','reports.js','care.js','ai.js','charts.js',
  'forms.js','pharmacy.js','leave.js','omaha.js','schedule.js','exportdocs.js','dashboard.js','files.js','live.js','themes.js',
  'ui.js','navpane.js','pager.js','care6_flows.js',
  'views_entry.js','views_patients.js','views_ops.js','views_admin.js',
  'views_care.js','views_settings.js','care_actions.js','import.js','sync6.js','backup.js',
  'views_extra.js','office_actions.js','app.js','pmi.js','recognition.js','workplace.js','insight6.js','indicators6.js','hub6.js','entry6.js',
  'org_teams.js','household.js','costing.js','tb_dispensing.js','master_registry.js','master_analysis.js','waiting_urgent.js','portal_content.js',
  'bmi_clinical6.js','discharge_hardcopy6.js','monday_procurement6.js','handover_partners6.js',
  'admin_workflows6.js','dev_console6.js','workflow_engine6.js','visual_audit.js','strategic_governance67.js','role_consoles68.js'
];
