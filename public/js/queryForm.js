module.exports = function queryForm() {
    //query form code
    $("#hero_id").select2({
        //placeholder: "Played Any Hero",
        theme: "bootstrap",
        maximumSelectionSize: 1
    });
    $("#with_account_id").select2({
        //placeholder: "Included: Any Player",
        tags: teammate_list,
        theme: "bootstrap",
        maximumSelectionSize: 10
    });
    $("#teammate_hero_id").select2({
        //placeholder: "Team: Any Hero",
        theme: "bootstrap",
        maximumSelectionSize: 4
    });
    $("#enemy_hero_id").select2({
        //placeholder: "Enemy: Any Hero",
        theme: "bootstrap",
        maximumSelectionSize: 5
    });
    $("#leagueid").select2({
        //placeholder: "Enemy: Any Hero",
        theme: "bootstrap",
        maximumSelectionSize: 5
    });
    $("#compare").select2({
        tags: teammate_list,
        theme: "bootstrap",
        maximumSelectionSize: 5
    });
};