db.ratings.find().forEach(
    function (elem) {
        db.ratings.update(
            {
                _id: elem._id
            },
            {
                $set: {
                    time: elem._id.getTimestamp()
                }
            }
        );
    }
);