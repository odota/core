db.ratings.find().forEach(
    (elem) => {
      db.ratings.update(
        {
          _id: elem._id,
        },
        {
          $set: {
            time: elem._id.getTimestamp(),
          },
        }
        );
    }
);
