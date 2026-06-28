/* Shared BGM catalog.
   Audio files live outside this repo at:
   C:\dev\shared-assets\bgm\mysongs

   During local development, serve C:\dev\shared-assets on port 8778:
   python -m http.server 8778 --directory C:\dev\shared-assets
*/
(function () {
  const rootHttp = 'http://localhost:8778/bgm/mysongs/Lyrics/';
  const rootDev = '../shared-assets/bgm/mysongs/Lyrics/';
  const rootDevServer = '/shared-assets/bgm/mysongs/Lyrics/';
  function track(id, title, file) {
    return {
      id,
      title,
      src: rootHttp + file,
      sources: [rootHttp + file, rootDev + file, rootDevServer + file],
      rights: 'owned',
      enabled: true,
    };
  }
  window.CADENZA_BGM = [
    track('foreign-minuet', 'foreign_minuet', 'foreign_minuet.mp3'),
    track('logic-and-trick', 'logic_and_trick', 'logic_and_trick.mp3'),
    track('thunder-of-dawn', 'thunder_of_dawn', 'thunder_of_dawn.mp3'),
    track('velvet-lion', 'velvet_lion', 'velvet_lion.mp3'),
  ];
})();
