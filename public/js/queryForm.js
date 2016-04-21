window.queryForm = function()
{
    $("#included_account_id").select2(
    {
        tags: true,
        maximumSelectionLength: 10,
        theme: "bootstrap",
    });
    $("#excluded_account_id").select2(
    {
        tags: true,
        maximumSelectionLength: 10,
        theme: "bootstrap",
    });
    $("#with_hero_id").select2(
    {
        maximumSelectionLength: 5,
        theme: "bootstrap",
    });
    $("#enemy_hero_id").select2(
    {
        maximumSelectionLength: 5,
        theme: "bootstrap",
    });
    $("#purchased_item").select2(
    {
        maximumSelectionLength: 5,
        theme: "bootstrap",
    });
    $("#hero_id").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#isRadiant").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#win").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#lane_role").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#patch").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#game_mode").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#lobby_type").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#region").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
    $("#date").select2(
    {
        maximumSelectionLength: 1,
        theme: "bootstrap",
    });
};