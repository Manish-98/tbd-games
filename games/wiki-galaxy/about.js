export const wikiGalaxyAbout = {
  objective: 'Explore the network around a Wikipedia article and compare its linked articles using simple measurable properties.',
  concept: 'Wikipedia link graphs, article metadata, and ranking data visualized as a galaxy.',
  howToPlay: 'Enter a Wikipedia article, load its linked articles, then switch between five ranking modes. Larger and brighter stars represent stronger values for the selected direction.',
  rules: [
    'The center star is the article you entered.',
    'Each surrounding star represents an article linked from the center article.',
    'The selected ranking determines star size and brightness.',
    'Changing the direction reverses which values receive the strongest visual treatment.',
    'Selecting a star reveals its value and provides a link to the article.'
  ],
  components: [
    'Wikipedia article search',
    '2D article galaxy',
    'Five ranking modes with ascending or descending direction',
    'Article detail popover',
    'Live Wikipedia metadata'
  ],
  controls: [
    'Enter an article title and choose Explore.',
    'Choose a ranking from the Rank by control.',
    'Toggle the ranking direction.',
    'Click a star to inspect its article and statistic.'
  ],
  scoring: 'There is no score. The game is an exploration and comparison experience driven by live Wikipedia data.',
  visual: {
    title: 'Build a wiki galaxy',
    steps: ['Enter an article', 'Map its linked articles', 'Choose what to rank', 'Explore the brightest stars']
  }
};
