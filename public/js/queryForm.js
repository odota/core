module.exports = function queryForm() {
    //query form code
    $("#hero_id").select2({
        //placeholder: "Played Any Hero",
        maximumSelectionSize: 1
    });
    $("#with_account_id").select2({
        //placeholder: "Included: Any Player",
        tags: teammate_list,
        maximumSelectionSize: 10
    });
    $("#teammate_hero_id").select2({
        //placeholder: "Team: Any Hero",
        maximumSelectionSize: 4
    });
    $("#enemy_hero_id").select2({
        //placeholder: "Enemy: Any Hero",
        maximumSelectionSize: 5
    });
    $("#leagueid").select2({
        //placeholder: "Enemy: Any Hero",
        maximumSelectionSize: 5
    });
    $("#compare").select2({
        tags: teammate_list,
        maximumSelectionSize: 5
    });
};