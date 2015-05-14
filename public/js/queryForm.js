module.exports = function queryForm() {
    //query form code
    $("#hero_id").select2({
        //placeholder: "Played Any Hero",
        maximumSelectionSize: 1
    });
    $("#with_account_id").select2({
        //placeholder: "Included: Any Player",
        tags: [],
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
    $('form').submit(function(e) {
        //updates the table on form submit without reload
        //e.preventDefault();
        //console.log(JSON.stringify($('form').serializeObject()));
        //table.draw();
        //return false;
    });
    $('.form-control').on('change', function(e) {
        //updates the table on form change without reload
        //table.draw();
    });
};