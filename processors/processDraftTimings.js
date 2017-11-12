/**
 *
 */

function processDraftTimings(entries, meta) {

    let currpickban;
    let DraftTimings = [];

    const heroIdToSlot = meta.hero_id_to_slot;

    for(let i = 0; i < entries.length; i++) {

        const e = entries[i];

        const hero_id = e.PicksAndBans;

        if(e.type === 'PicksAndBans') {

            currpickban = currpickban || {
                order: e.PicksAndBansOrder,
                picksorban: e.PickorBan,
                team: e.PicksAndBansActiveTeam,
                hero: e.PicksAndBans,
                player_slot: e.PickorBan === 'pick' ? heroIdToSlot[hero_id] : NaN,
                time: e.PicksAndBansTime,
                extratime: e.PicksAndBansActiveTeam === 2 ? e.PicksAndBansExTime0 : e.PicksAndBansExTime1,
                totaltimetaken: 0,
                extratimetaken: 0,


            }
            DraftTimings.push(JSON.parse(JSON.stringify(currpickban)));
            currpickban = null;
        }

    }


    for(let j = 0; j < DraftTimings.length; j++) {

        const pnb = DraftTimings[j];

        const order = pnb.order;
        const team = pnb.team;

        let previousorder = 0;

        // find previous pick or ban from that team
        for (let i = 0; i < DraftTimings.length; i++) {

            let currpick = DraftTimings[i];

            if (currpick.order < order && currpick.order > previousorder && currpick.team == team) {
                previousorder = currpick.order
            }

        };


        if (previousorder === 0) {

            DraftTimings[j].totaltimetaken =  (pnb.time - 0);

            DraftTimings[j].extratimetaken = (130 - pnb.extratime);


        } else {

            let ind;

            //find which row is the previous order
            for(let i = 0; i < DraftTimings.length; i++) {

                let currpick = DraftTimings[i];

                if(currpick.order === previousorder) {
                    ind = i;
                }

            };

            let ind2;

            // find the time of the end of the previous order
            for(let i = 0; i < DraftTimings.length; i++) {

                let currpick = DraftTimings[i];

                if(currpick.order === (order-1)) {
                    ind2 = i;
                }

            };

            // calculate the timings

            const thepastpick = DraftTimings[ind2];

            const pastpicks = DraftTimings[ind];

            DraftTimings[j].totaltimetaken = (pnb.time - thepastpick.time);

            DraftTimings[j].extratimetaken = (pastpicks.extratime - pnb.extratime);



        }

    };



    return DraftTimings;
}

module.exports = processDraftTimings;
