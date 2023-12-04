Array.from(new Array(3), (v, i) => i).forEach(async (i) => {
  while (true) {
    if (Math.random() < 0.1) {
      throw new Error('failed');
    }
    console.log(i, 'success');
  }
});
