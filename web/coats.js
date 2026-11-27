// Coat and eye colours for cat.js, as plain global constants.
'use strict';
// Coats, drawn from real cats but drawn the way the black one is: flat fills with crisp edges,
// a few bold markings instead of texture, one outline colour (`rim`) round the whole cat and a
// warmer shade of it (`ink`, `arm`) for the lines inside. Each has its own nose, inner ear, muzzle
// and bib colours, and the `eye` it most often has. `tabby` lists the stripe colour for coats that
// can be striped, and `striped` ones wear the stripes unless the pattern is set to solid. `point`
// and `points` give the dark mask, ears, legs and tail of colourpoint breeds, and `ears` scales the
// ears. `cheek` is a faint pink flush on the pale coats (dark fur would only muddy it). `shade` is
// the soft volume shading of the 3D style; black stays a flat silhouette like the reference.
const COATS = {
  black: { fur: '#151515', ink: '#151515', rim: '#f6f3e8', arm: '#8a8984', paw: '#1d1d1c', toe: '#4a4a46', whisker: '#dedcd4', eye: 'gold' },
  tuxedo: { fur: '#1a1a1a', ink: '#151515', lid: '#e4c25a', rim: '#f6f3e8', arm: '#8a8984', paw: '#f8f7f2', toe: '#bcbab2', whisker: '#e8e6de', eye: 'green',
    light: '#f8f7f2', muzzle: 1, tuxedo: 1, nose: '#e7a0a0', mouth: '#9a8f88', inner: '#3a2e2e', innerAmt: 1, shade: 0.25 },
  orange: { fur: '#f2a65e', ink: '#b86f33', lid: '#8a4a1f', rim: '#fff8ea', arm: '#c47a3a', paw: '#fff6e8', toe: '#e6bf98', whisker: '#fffaf0', eye: 'green',
    light: '#fff1dc', muzzle: 1, bib: 1, nose: '#ef8a80', mouth: '#a5643a', inner: '#f7b9a8', innerAmt: 1, shade: 0.55,
    tabby: '#d0752f', striped: true, cheek: 0.3 },
  grey: { fur: '#9aa7b8', ink: '#6a7687', lid: '#3d4450', rim: '#f6f5f0', arm: '#6f7b8c', paw: '#f2f1ec', toe: '#c3c8ce', whisker: '#f4f2ea', eye: 'copper',
    light: '#c9d1dc', muzzle: 1, bib: 0.6, nose: '#8a8494', mouth: '#5a6575', inner: '#d9b8bf', innerAmt: 1, shade: 0.55,
    tabby: '#7b889a', cheek: 0.3 },
  britishBlueGolden: { fur: '#ddbd9c', tip: '#8d9bb0', light: '#fff0dc', dark: '#65738b', brow: 0.82,
    ink: '#b99c87', lid: '#7d7782', rim: '#f5eddf', arm: '#b89d85', paw: '#f1dac0', toe: '#c9aa95',
    pad: '#d69ca1', whisker: '#fff3e5', eye: 'olive', nose: '#c58385', mouth: '#9b7376',
    muzzle: 0.92, inner: '#e9b3b4', innerAmt: 0.88, shade: 0.45, cheek: 0.18,
    ears: 0.80, headWidth: 1.075, irisHeight: 0.15 },
  white: { fur: '#fbf9f3', ink: '#b3a594', lid: '#8a7f72', rim: '#8f7f6e', arm: '#bdb09f', paw: '#fbf9f3', toe: '#e6cfc8', whisker: '#b6ada0', eye: 'blue',
    nose: '#f29ca0', mouth: '#c99c94', inner: '#f7bfc2', innerAmt: 1, shade: 0.5, cheek: 0.4 },
  calico: { fur: '#fbf8f1', ink: '#b3a594', lid: '#6e5a4e', rim: '#8f7f6e', arm: '#bdb09f', paw: '#fbf8f1', toe: '#e6cfc8', whisker: '#b6ada0', eye: 'gold',
    patchA: '#ee9c4f', patchB: '#3a302b', calico: 1, nose: '#f0a09a', mouth: '#b08a80', inner: '#f4bab4', innerAmt: 1, shade: 0.5, cheek: 0.35 },
  // Seal point: cream body, dark brown mask, ears, boots and tail, each with a clean edge.
  siamese: { fur: '#f3e8d6', ink: '#a48b76', rim: '#8f7a66', arm: '#a48b76', paw: '#5e4436', toe: '#3e2c23', pad: '#2f211b', whisker: '#f3ece0', eye: 'blue',
    point: '#5a3f31', points: 1, nose: '#2f211b', mouth: '#24180f', inner: '#7a5c4c', innerAmt: 1, shade: 0.45 },
  // Seal bicolour: softer points, white inverted V on the face, white chest and mitts.
  ragdoll: { fur: '#f6efe4', ink: '#ab9583', rim: '#8f7f6e', arm: '#ab9583', paw: '#fdfbf7', toe: '#ddd2c6', whisker: '#cfc4b6', eye: 'blue',
    point: '#7a5a48', points: 1, light: '#fdfbf7', muzzle: 1, tuxedo: 1, bib: 1, nose: '#ec9fa0', mouth: '#a07e70', inner: '#a8806f', innerAmt: 1, shade: 0.5,
    cheek: 0.3 },
  // Devon rex: big low-set ears and big eyes, here in a soft lilac.
  devon: { fur: '#c6b8c3', ink: '#8f808b', lid: '#5b5156', rim: '#fbf9f6', arm: '#94858f', paw: '#f2edf0', toe: '#cdc2c8', whisker: '#fbf9f6', eye: 'gold',
    light: '#e6dde3', muzzle: 1, ears: 1.45, nose: '#e0a0a8', mouth: '#7f7479', inner: '#f2bcc6', innerAmt: 1, shade: 0.5, cheek: 0.35 },
  // American shorthair: silver with black tabby stripes.
  silver: { fur: '#cfd4d9', ink: '#878d94', lid: '#3f444a', rim: '#fbfbf8', arm: '#8a9097', paw: '#f3f4f4', toe: '#bcc2c8', whisker: '#fbfbf8', eye: 'green',
    light: '#f3f4f4', muzzle: 1, bib: 0.8, nose: '#d79395', mouth: '#6c7279', inner: '#eebcc0', innerAmt: 1, shade: 0.55,
    tabby: '#50555c', striped: true, cheek: 0.3 },
  // Chinese li hua: brown mackerel tabby.
  lihua: { fur: '#c29c6c', ink: '#80623f', lid: '#3d2f22', rim: '#fff8ec', arm: '#86684a', paw: '#f2e9d8', toe: '#d2bd9c', whisker: '#fff8ec', eye: 'green',
    light: '#f0e5d0', muzzle: 1, bib: 0.7, nose: '#c27a66', mouth: '#5e4836', inner: '#e2ad98', innerAmt: 1, shade: 0.55,
    tabby: '#6b5038', striped: true, cheek: 0.25 },
  husky: { fur: '#54647a', light: '#f8f4e9', ink: '#465369', lid: '#293445', rim: '#f8f4e9',
    arm: '#82909e', paw: '#f8f4e9', toe: '#c6c7c8', pad: '#596173', eye: 'blue',
    inner: '#bba5b1', innerAmt: 1, shade: 0.55, cheek: 0.10, dogMask: 1 },
  corgi: { fur: '#d88c4f', light: '#fff1db', ink: '#ad663c', lid: '#503129', rim: '#fff1db',
    arm: '#bf8056', paw: '#fff1db', toe: '#d2ae91', pad: '#906968', eye: 'amber',
    inner: '#e8a9a0', innerAmt: 1, shade: 0.45, cheek: 0.18, dogMask: 2 },
  malamute: { fur: '#5b5551', light: '#fff9ef', dark: '#b5a39e', ink: '#54494a', lid: '#a5a9ad', rim: '#f9ecde',
    arm: '#a99a95', paw: '#fff9ef', toe: '#ccbbad', pad: '#b77d84', eye: 'skyBlue',
    inner: '#d5aaad', innerAmt: 1, shade: 0.56, cheek: 0.09, dogMask: 3 },
  goldenRetriever: { fur: '#dca054', light: '#f1ca87', dark: '#b9793b', ink: '#a66839',
    lid: '#4c3027', rim: '#f4d693', arm: '#b97c47', paw: '#ebbc78', toe: '#bd905c',
    pad: '#936452', eye: 'brown', shade: 0.53, cheek: 0.12, dogMask: 4, dogMuzzle: '#f5d59d' },
  samoyed: { fur: '#f6f3f2', light: '#fffdfb', dark: '#b8aeb7', ink: '#b9afb5',
    lid: '#514039', rim: '#fffcf9', arm: '#c7bcbf', paw: '#fffcf9', toe: '#d4cacc',
    pad: '#9b797e', eye: 'darkBrown', inner: '#e5b5b9', innerAmt: 0.56, shade: 0.38, cheek: 0.12, dogMask: 5 },
  dachshund: { fur: '#352b2e', light: '#c77d45', dark: '#272027', ink: '#5b4140',
    lid: '#8a5945', rim: '#ddac8b', arm: '#6d4e44', paw: '#cc8854', toe: '#935631',
    pad: '#65414a', eye: 'brown', shade: 0.51, cheek: 0.05, dogMask: 6, dogMuzzle: '#cb8751' },
  borderCollie: { fur: '#414550', light: '#f7f6ed', dark: '#242b36', ink: '#39414c',
    lid: '#a5a9ad', rim: '#e7e8e4', arm: '#636a77', paw: '#f7f6ed', toe: '#bfc1bc',
    pad: '#ac7d84', eye: 'brown', inner: '#d9a3ae', innerAmt: 0.65, shade: 0.48,
    cheek: 0.10, dogMask: 7 },
};
const EYES = { gold: '#dcb64a', green: '#93c255', olive: '#b0c378', blue: '#6eb2e6', skyBlue: '#2dafe8',
  amber: '#e59a32', copper: '#d9792f', brown: '#89583a', darkBrown: '#302528' };
