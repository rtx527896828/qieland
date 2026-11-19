import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  SharedMaterials,
  createCornKernelTexture,
  createFeltMaterial,
  createPlushMaterial,
} from './PlushMaterials.js';

export const JELLYCAT_ROSTER = [
  {
    id: 'aubergine_charm',
    name: '小短腿茄子挂件 (Aubergine Bag Charm)',
    emoji: '🍆',
    category: '官方三茄子',
    unlocked: true,
    lore: '完美复刻 Jellycat 官方挂件款！烟熏灰紫丝绒梨形肚皮、高位豆豆眼与微笑，搭配暖卡其竖条纹灯芯绒小短腿与银色圆吊牌！',
    dialogues: [
      '欢迎来到 Qieland 3.5！我的小短腿稳稳地长在梨形肚皮下面，走路、欢呼都不会双脚浮空啦！',
      '快去北边的圣茄城堡看看，全新的多塔洋葱顶大城堡配上原生 3D 城堡模型超级壮观！',
    ],
  },
  {
    id: 'aubergine_standard',
    name: '经典茄子 (Vivacious Aubergine)',
    emoji: '🍆',
    category: '官方三茄子',
    unlocked: true,
    lore: '100% 还原经典款 Vivacious Vegetable Aubergine！无手无腿的上窄下宽圆润梨形不倒翁，橄榄绿六瓣圆润毛毡花萼，温柔治愈。',
    dialogues: [
      '我是经典原版无腿小茄子，走起路来会像不倒翁一样左右摇摆蹦蹦跳哦～',
      '旁边的环形运河水面现在会泛起阳光波光，还有 48 朵睡莲荷花随波摇曳呢！',
    ],
  },
  {
    id: 'aubergine_giant',
    name: '大号敦实茄子 (Giant Aubergine)',
    emoji: '🍠',
    category: '官方三茄子',
    unlocked: false,
    lore: '圆滚滚的超大梨形敦实茄子！下半身超级饱满软糯，往软垫上一坐就不想起来，最爱在喷泉广场晒太阳。',
    dialogues: [
      '哼哼，我可是大号敦实款茄子，抱起来安全感满分！',
      '在茄子衣橱里也能随时变成我这个敦实不倒翁体型去坐旋转木马哦！',
    ],
  },
  {
    id: 'aubergine_king',
    name: '茄子国王 (King Aubergine)',
    emoji: '👑',
    category: '茄子家族',
    unlocked: false,
    lore: '戴着镶嵌紫宝石黄金王冠的圣茄城堡之主，率领夜间皇家花车巡游。',
    dialogues: [
      '吾乃 Qieland 茄子国王！圣茄皇家城堡去掉了多余的巨屏遮挡，9 座错落高塔和鎏金洋葱穹顶气势恢宏！',
      '点击右上角切换到「星夜花车烟花秀」，看本王带着大家巡游撒金币！',
    ],
  },
  {
    id: 'aubergine_magician',
    name: '魔术师茄子 (Magician Aubergine)',
    emoji: '🎩',
    category: '茄子家族',
    unlocked: false,
    lore: '戴着黑色高礼帽的皇家魔术师，常在圣茄城堡门口为大家变出彩虹与惊喜。',
    dialogues: [
      'Abracadabra！露天剧场的巨幕舞台就在城堡广场西侧，正循环播放着 LTX-2.3 魔法动画！',
      '试试切换成「太阳雨彩虹」天气，看水面上波光粼粼的双彩虹倒影！',
    ],
  },
  {
    id: 'aubergine_astronaut',
    name: '太空茄子 (Astro Aubergine)',
    emoji: '🧑‍🚀',
    category: '茄子家族',
    unlocked: false,
    lore: '戴着透明太空头罩的星际探索茄子，最喜欢乘坐星空摩天轮俯瞰全园。',
    dialogues: [
      '摩天轮也换上了双层钻石桁架与皇家花篮吊舱，最高点景色绝美！',
    ],
  },
  {
    id: 'aubergine_cool',
    name: '酷盖墨镜茄子 (Cool Shades Aubergine)',
    emoji: '😎',
    category: '茄子家族',
    unlocked: false,
    lore: '戴着潮流墨镜和耳机的园区 DJ，东岸毛绒碰碰车派对馆的绝对王者。',
    dialogues: [
      'Yo！穿过东侧高拱桥就是新建了连拱木顶棚的毛绒碰碰车馆，来场氮气对撞吧！',
    ],
  },
  {
    id: 'aubergine_baby',
    name: '奶嘴宝宝茄子 (Baby Aubergine)',
    emoji: '🍼',
    category: '茄子家族',
    unlocked: false,
    lore: '浅灰紫色迷你梨形宝宝，围着天蓝色小围兜，最喜欢果蔬交响曲旋转木马。',
    dialogues: [
      '唔嘛～旋转木马顶棚换成了粉白波浪条纹帐篷，还有螺旋铜柱和小马鞍呢！',
    ],
  },
  {
    id: 'avocado',
    name: '活力牛油果 (Amuseables Avocado)',
    emoji: '🥑',
    category: '果蔬家族',
    unlocked: false,
    lore: '拥有亮面棕色圆果核肚腩的活力伙伴，镇守北桥外侧的「牛油果高空弹射跳楼机」。',
    dialogues: [
      '我的高空跳楼机塔顶加盖了金色镶边牛油果穹顶凉亭，老远就能看到！',
    ],
  },
  {
    id: 'tomato',
    name: '害羞小番茄 (Vivacious Tomato)',
    emoji: '🍅',
    category: '果蔬家族',
    unlocked: false,
    lore: '鲜红饱满的可爱小番茄，最爱在紫金闪电过山车站台为勇士们鼓掌。',
    dialogues: [
      '紫金过山车升级成了双轨平行钢轨 + 150 根横向枕木 + 桁架立柱，超有工业美感！',
    ],
  },
  {
    id: 'sweetcorn',
    name: '甜心玉米 (Amuseables Sweetcorn)',
    emoji: '🌽',
    category: '果蔬家族',
    unlocked: false,
    lore: '金黄玉米粒满载的阳光朋友，守护着南桥旁边的果蔬奇幻漂流船码头。',
    dialogues: [
      '运河水波光粼粼的，沿着莲花丛划船从拱桥底穿过去超级治愈！',
    ],
  },
  {
    id: 'leek',
    name: '翠绿大葱 (Vivacious Leek)',
    emoji: '🥬',
    category: '果蔬家族',
    unlocked: false,
    lore: '修长优雅的绅士大葱，喜欢在铺满三叶草和碎花的草坪小径散步。',
    dialogues: [
      '每一棵大树现在都有自然弯曲的分枝树干和多层饱满树冠啦！',
    ],
  },
  {
    id: 'bartholomew_bear',
    name: '巴塞罗那熊 (Bartholomew Bear)',
    emoji: '🧸',
    category: '明星动物',
    unlocked: false,
    lore: '蓬松暖棕色的古典泰迪熊，西南区「巴塞罗那熊转转杯」的温柔船长。',
    dialogues: [
      '我的转转杯现在是真正的描金瓷茶杯造型，下面还垫着波浪荷叶边杯托碟哦！',
    ],
  },
  {
    id: 'bashful_bunny',
    name: '害羞邦尼兔 (Bashful Bunny)',
    emoji: '🐰',
    category: '明星动物',
    unlocked: false,
    lore: '奶油色长垂耳小兔，在西侧嘉年华广场同时经营打地鼠菜园与 3D 抓娃娃机。',
    dialogues: [
      '菜园四周修好了木头小栅栏和南瓜菜畦，快来敲敲冒头的蔬菜吧！',
    ],
  },
  {
    id: 'croissant',
    name: '法式可颂面包 (Amuseables Croissant)',
    emoji: '🥐',
    category: '甜点家族',
    unlocked: false,
    lore: '酥脆金黄的法式可颂面包，经常在主街咖啡茶座与旋转木马之间穿梭。',
    dialogues: [
      '我的灯芯绒小短腿稳稳长在酥皮肚肚下面，从哪个角度看都不会浮空啦！',
    ],
  },
  {
    id: 'coffee_cup',
    name: '拿铁咖啡杯 (Amuseables Coffee)',
    emoji: '☕',
    category: '甜点家族',
    unlocked: false,
    lore: '顶着蓬松奶泡的卡其隔热套咖啡杯，园区甜品补给站代言人。',
    dialogues: [
      '迎宾大道上的遮阳伞茶座和复古爆米花推车都营业中，欢迎光临！',
    ],
  },
  {
    id: 'boiled_egg',
    name: '开心水煮蛋 (Amuseables Boiled Egg)',
    emoji: '🥚',
    category: '甜点家族',
    unlocked: false,
    lore: '拥有明黄色太阳蛋黄肚皮的呆萌小圆蛋，热爱与大家合影打卡。',
    dialogues: [
      '按 [P] 键把我和朋友们一起拍进明信片吧！',
    ],
  },
];

export const COSTUME_LIST = [
  { id: 'aubergine_charm', name: '官方挂件长腿茄', emoji: '🍆', desc: '100%还原参考图3：灰紫梨形 + 暖卡其灯芯绒短腿 + 银色挂环' },
  { id: 'aubergine_standard', name: '官方经典无腿茄', emoji: '🍆', desc: '100%还原参考图1：无腿灰紫梨形不倒翁 + 高位微豆豆眼' },
  { id: 'aubergine_giant', name: '官方大号敦实茄', emoji: '🍠', desc: '100%还原参考图2：超饱满宽肚大梨形不倒翁' },
  { id: 'aubergine_king', name: '茄子国王装', emoji: '👑', desc: '官方灰紫茄身 + 宝石黄金王冠与红丝绒披风' },
  { id: 'aubergine_magician', name: '奇幻魔术师', emoji: '🎩', desc: '官方灰紫茄身 + 魔法高礼帽与星光魔术棒' },
  { id: 'aubergine_astronaut', name: '太空宇航员', emoji: '🧑‍🚀', desc: '官方灰紫茄身 + 透明玻璃太空头盔与背包' },
  { id: 'aubergine_cool', name: '酷盖墨镜DJ', emoji: '😎', desc: '官方灰紫茄身 + 墨镜与紫金头戴式耳机' },
  { id: 'comfy_standard_glb', name: 'ComfyUI 经典茄子GLB', emoji: '✨', desc: '直接由你提供的官方图1经 ComfyUI Trellis2 转出的原生 3D' },
  { id: 'comfy_giant_glb', name: 'ComfyUI 敦实茄子GLB', emoji: '✨', desc: '直接由你提供的官方图2经 ComfyUI Trellis2 转出的原生 3D' },
  { id: 'comfy_charm_glb', name: 'ComfyUI 挂件茄子GLB', emoji: '✨', desc: '直接由你提供的官方图3经 ComfyUI Trellis2 转出的原生 3D' },
];

function getAubergineProfile(variant = 'standard') {
  const height = variant === 'giant' ? 1.24 : variant === 'charm' ? 1.06 : 1.15;
  const maxWidth = variant === 'giant' ? 0.50 : variant === 'charm' ? 0.39 : 0.42;

  const radiusAtT = (t) => {
    if (t <= 0 || t >= 1) return 0.001;
    // Flat wide cushioned plush bottom (stays wide at x = ±0.14 so legs embed directly!)
    const bottomRound = Math.pow(Math.sin(Math.min(t / 0.14, 1) * (Math.PI / 2)), 0.48);
    const topCap = Math.pow(Math.sin(Math.min((1 - t) / 0.16, 1) * (Math.PI / 2)), 0.65);
    const taper = 1.0 - 0.56 * Math.pow(t, 1.35);
    return Math.max(0.001, maxWidth * bottomRound * topCap * taper);
  };

  return { height, maxWidth, radiusAtT };
}

function buildOfficialAubergine(bodyGroup, variant = 'standard', mat = SharedMaterials.aubergineMauve) {
  const { height, radiusAtT } = getAubergineProfile(variant);

  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(radiusAtT(t), (t - 0.5) * height));
  }
  const bodyGeo = new THREE.LatheGeometry(pts, 48);
  const bodyMesh = new THREE.Mesh(bodyGeo, mat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyGroup.add(bodyMesh);

  const seamPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = 0.06 + (i / 8) * 0.2;
    seamPts.push(new THREE.Vector3(0, (t - 0.5) * height, radiusAtT(t) + 0.002));
  }
  const seamMesh = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts), 10, 0.0055, 6, false),
    SharedMaterials.seamLine
  );
  bodyGroup.add(seamMesh);

  const calyxGroup = new THREE.Group();
  const capT = 0.90;
  const capY = (capT - 0.5) * height;
  const capR = radiusAtT(capT);
  calyxGroup.position.y = capY;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(capR * 1.06, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
    SharedMaterials.calyxOlive
  );
  dome.scale.set(1.0, 0.55, 1.0);
  dome.position.y = 0.01;
  dome.castShadow = true;
  calyxGroup.add(dome);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.25;
    const lobe = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.09, 8, 12), SharedMaterials.calyxOlive);
    lobe.scale.set(1.15, 1.0, 0.45);
    const orbit = capR * 0.92;
    lobe.position.set(Math.cos(a) * orbit, -0.055, Math.sin(a) * orbit);
    lobe.rotation.y = -a + Math.PI / 2;
    lobe.rotation.x = 0.42;
    lobe.castShadow = true;
    calyxGroup.add(lobe);
  }

  const stalkH = variant === 'charm' ? 0.14 : 0.26;
  const stalkPts = [
    new THREE.Vector3(0, 0.04, 0),
    new THREE.Vector3(0.015, 0.04 + stalkH * 0.55, 0.005),
    new THREE.Vector3(0.032, 0.04 + stalkH, 0.01),
  ];
  const stalk = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stalkPts), 12, variant === 'charm' ? 0.038 : 0.044, 12, false),
    SharedMaterials.stemOlive
  );
  stalk.castShadow = true;
  const tipCap = new THREE.Mesh(
    new THREE.SphereGeometry(variant === 'charm' ? 0.042 : 0.048, 12, 12),
    SharedMaterials.stemOlive
  );
  tipCap.position.copy(stalkPts[2]);
  calyxGroup.add(stalk, tipCap);

  if (variant === 'charm') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 10, 24), SharedMaterials.silver);
    ring.position.set(-0.04, 0.17, 0);
    ring.rotation.y = 0.25;
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.008, 18), SharedMaterials.silver);
    tag.rotation.x = Math.PI / 2;
    tag.position.set(-0.12, 0.12, 0.04);
    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 10, 16), SharedMaterials.silver);
    clasp.scale.set(0.75, 1.5, 1.0);
    clasp.position.set(-0.04, 0.30, 0);
    calyxGroup.add(ring, tag, clasp);
  }
  bodyGroup.add(calyxGroup);

  const eyeT = 0.74;
  const eyeY = (eyeT - 0.5) * height;
  const eyeR = radiusAtT(eyeT);
  const dr = radiusAtT(eyeT + 0.02) - radiusAtT(eyeT - 0.02);
  const dy = 0.04 * height;
  const slopeAngle = Math.atan2(-dr, dy);
  const eyeSpread = eyeR * 0.32;

  for (const xSign of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 14), SharedMaterials.beadEye);
    const x = xSign * eyeSpread;
    const z = Math.sqrt(Math.max(0.001, eyeR * eyeR - x * x)) + 0.008;
    eye.position.set(x, eyeY, z);
    eye.scale.set(1.0, 1.0, 0.7);
    bodyGroup.add(eye);
  }

  const smileT = 0.65;
  const smileY = (smileT - 0.5) * height;
  const smileR = radiusAtT(smileT);
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.044, 0.008, 8, 18, Math.PI * 0.78),
    SharedMaterials.stitchDark
  );
  smile.rotation.z = Math.PI * 1.11;
  smile.rotation.x = -slopeAngle * 0.55;
  smile.position.set(0, smileY + 0.015, smileR + 0.009);
  bodyGroup.add(smile);

  return { calyxGroup, minLocalY: -0.5 * height, baseY: 0.65 };
}

/**
 * Chunky Jellycat plush short legs (height 0.19m) deeply socketed into torso underside (+0.20m)
 * plus a plush hip collar cuff wrapping the leg root so ZERO floating gap is visible from ANY angle!
 */
function addConnectedLegs(hipGroup, legSpread = 0.115, legMat = SharedMaterials.charmCorduroyTan, cuffMat = SharedMaterials.aubergineMauve) {
  const hipPivotY = 0.21;
  const footRadiusY = 0.055;
  const visibleLen = hipPivotY - footRadiusY; // 0.155
  const socketUp = 0.22; // leg top reaches y = 0.43 inside torso!
  const totalCylLen = visibleLen + socketUp;

  const makeLeg = (xSign) => {
    const pivot = new THREE.Group();
    pivot.position.set(xSign * legSpread, hipPivotY, 0);

    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.054, totalCylLen, 16),
      legMat
    );
    stalk.position.y = (socketUp - visibleLen) * 0.5;
    stalk.castShadow = true;
    pivot.add(stalk);

    // Plush torso hip collar cuff right at leg attachment so seam looks naturally tucked into fur!
    const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 12), cuffMat);
    cuff.scale.set(1.1, 0.75, 1.1);
    cuff.position.y = 0.03;
    pivot.add(cuff);

    const footGeo = new THREE.SphereGeometry(0.086, 18, 14);
    footGeo.scale(0.95, 0.68, 1.25);
    const foot = new THREE.Mesh(footGeo, legMat);
    foot.position.set(0, -visibleLen, 0.03);
    foot.castShadow = true;
    pivot.add(foot);

    hipGroup.add(pivot);
    return pivot;
  };

  return { leftLeg: makeLeg(-1), rightLeg: makeLeg(1) };
}

function addAubergineCostumeProps(id, bodyGroup, rightArm) {
  const accGroup = new THREE.Group();
  if (id === 'aubergine_king') {
    const crown = new THREE.Group();
    crown.position.set(0.04, 0.64, 0);
    crown.rotation.z = -0.1;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.11, 20, 1, true), SharedMaterials.gold);
    crown.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.09, 8), SharedMaterials.gold);
      spike.position.set(Math.cos(a) * 0.13, 0.08, Math.sin(a) * 0.13);
      crown.add(spike);
      const gem = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 10, 10),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? '#a855f7' : '#ff4d6d', emissive: '#581c87', emissiveIntensity: 0.45 })
      );
      gem.position.set(Math.cos(a) * 0.13, 0.13, Math.sin(a) * 0.13);
      crown.add(gem);
    }
    accGroup.add(crown);

    const capeGeo = new THREE.CylinderGeometry(0.24, 0.50, 0.82, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76);
    const cape = new THREE.Mesh(capeGeo, createFeltMaterial('#9e1b3c', { doubleSided: true }));
    cape.position.set(0, -0.05, -0.05);
    cape.castShadow = true;
    accGroup.add(cape);
  } else if (id === 'aubergine_magician') {
    const hat = new THREE.Group();
    hat.position.set(-0.02, 0.66, 0);
    hat.rotation.z = 0.08;
    const blackMat = createFeltMaterial('#1e1726');
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 24), blackMat);
    const tall = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.28, 24), blackMat);
    tall.position.y = 0.15;
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.05, 24), createFeltMaterial('#d9385a'));
    ribbon.position.y = 0.04;
    hat.add(brim, tall, ribbon);
    accGroup.add(hat);

    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 10), blackMat);
    wand.position.set(0.12, -0.02, 0.22);
    wand.rotation.x = Math.PI * 0.45;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), SharedMaterials.gold);
    star.position.set(0.12, 0.02, 0.45);
    rightArm.add(wand, star);
  } else if (id === 'aubergine_astronaut') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 28), SharedMaterials.glassDome);
    helmet.position.set(0, 0.22, 0.01);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.042, 12, 28), SharedMaterials.silver);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, -0.08, 0);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), SharedMaterials.silver);
    pack.position.set(0, 0.02, -0.34);
    accGroup.add(helmet, collar, pack);
  } else if (id === 'aubergine_cool') {
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#111118', roughness: 0.15, metalness: 0.5 });
    const lLens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.03), shadeMat);
    lLens.position.set(-0.08, 0.255, 0.25);
    const rLens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.03), shadeMat);
    rLens.position.set(0.08, 0.255, 0.25);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.025), SharedMaterials.gold);
    bridge.position.set(0, 0.265, 0.25);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.028, 12, 28, Math.PI), SharedMaterials.gold);
    band.position.set(0, 0.30, 0);
    const lCup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.065, 18), createPlushMaterial('#d8458b'));
    lCup.rotation.z = Math.PI / 2;
    lCup.position.set(-0.29, 0.26, 0);
    const rCup = lCup.clone();
    rCup.position.x = 0.29;
    accGroup.add(lLens, rLens, bridge, band, lCup, rCup);
  } else if (id === 'aubergine_baby') {
    const bib = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 18, 14, 0, Math.PI, 0, Math.PI * 0.55),
      createFeltMaterial('#bfe3ff')
    );
    bib.position.set(0, -0.02, 0.18);
    accGroup.add(bib);
  }
  bodyGroup.add(accGroup);
  return accGroup;
}

function addCompanionFace(parent, zPos, yPos = 0.08, eyeSpread = 0.12, smileScale = 0.9, blush = true) {
  const faceGroup = new THREE.Group();
  faceGroup.position.set(0, yPos, zPos);
  const eyeGeo = new THREE.SphereGeometry(0.032, 14, 14);
  const leftEye = new THREE.Mesh(eyeGeo, SharedMaterials.beadEye);
  leftEye.position.set(-eyeSpread, 0.04, 0);
  const rightEye = new THREE.Mesh(eyeGeo, SharedMaterials.beadEye);
  rightEye.position.set(eyeSpread, 0.04, 0);
  faceGroup.add(leftEye, rightEye);

  const smileGeo = new THREE.TorusGeometry(0.056 * smileScale, 0.009, 8, 18, Math.PI * 0.8);
  const smile = new THREE.Mesh(smileGeo, SharedMaterials.stitchDark);
  smile.rotation.z = Math.PI * 1.1;
  smile.position.set(0, -0.02, 0.004);
  faceGroup.add(smile);

  if (blush) {
    const blushMat = new THREE.MeshStandardMaterial({ color: '#ff96ad', roughness: 0.85, transparent: true, opacity: 0.5 });
    const bGeo = new THREE.SphereGeometry(0.036, 12, 12);
    bGeo.scale(1.2, 0.7, 0.4);
    const lb = new THREE.Mesh(bGeo, blushMat);
    lb.position.set(-eyeSpread * 1.35, -0.01, -0.008);
    const rb = lb.clone();
    rb.position.x = eyeSpread * 1.35;
    faceGroup.add(lb, rb);
  }
  parent.add(faceGroup);
}

function addPlushArms(bodyGroup, mat, spread = 0.34, armY = 0.06) {
  const makeArm = (xSign) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xSign * spread, armY, 0.02);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.15, 8, 14), mat);
    arm.position.set(xSign * 0.04, -0.05, 0);
    arm.rotation.z = xSign * 0.55;
    arm.castShadow = true;
    armPivot.add(arm);
    bodyGroup.add(armPivot);
    return armPivot;
  };
  return { leftArm: makeArm(-1), rightArm: makeArm(1) };
}

function buildAvocado(bodyGroup) {
  const outerMat = createPlushMaterial('#436b3b');
  const innerMat = createPlushMaterial('#bdd975');
  const pitMat = createPlushMaterial('#7b4528', { roughness: 0.65, bumpScale: 0.015 });

  const outerGeo = new THREE.SphereGeometry(0.48, 32, 28);
  outerGeo.scale(0.95, 1.24, 0.7);
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.castShadow = true;
  bodyGroup.add(outer);

  const innerGeo = new THREE.SphereGeometry(0.41, 32, 28);
  innerGeo.scale(0.92, 1.18, 0.45);
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.z = 0.15;
  bodyGroup.add(inner);

  const pit = new THREE.Mesh(new THREE.SphereGeometry(0.20, 24, 24), pitMat);
  pit.position.set(0, -0.14, 0.30);
  pit.castShadow = true;
  bodyGroup.add(pit);

  addCompanionFace(bodyGroup, 0.35, 0.18, 0.10, 0.85, false);
  return { baseY: 0.63, legSpread: 0.12, cuffMat: outerMat };
}

function buildTomato(bodyGroup) {
  const redMat = createPlushMaterial('#df4949');
  const bodyGeo = new THREE.SphereGeometry(0.44, 32, 28);
  bodyGeo.scale(1.08, 0.9, 1.0);
  const body = new THREE.Mesh(bodyGeo, redMat);
  body.castShadow = true;
  bodyGroup.add(body);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 8), SharedMaterials.calyxOlive);
    leaf.position.set(Math.cos(a) * 0.12, 0.38, Math.sin(a) * 0.12);
    leaf.rotation.y = -a + Math.PI / 2;
    leaf.rotation.x = 1.25;
    bodyGroup.add(leaf);
  }
  addCompanionFace(bodyGroup, 0.43, 0.02, 0.12, 0.9, false);
  return { baseY: 0.47, legSpread: 0.12, cuffMat: redMat };
}

function buildSweetcorn(bodyGroup) {
  const cornMat = new THREE.MeshPhysicalMaterial({
    map: createCornKernelTexture(),
    roughness: 0.78,
    sheen: 0.75,
    sheenColor: new THREE.Color('#fff1a8'),
  });
  const cob = new THREE.Mesh(new THREE.CapsuleGeometry(0.30, 0.60, 14, 28), cornMat);
  cob.castShadow = true;
  bodyGroup.add(cob);

  const huskMat = createPlushMaterial('#71b865');
  for (const xSign of [-1, 1]) {
    const geo = new THREE.SphereGeometry(0.30, 20, 20);
    geo.scale(0.65, 1.42, 0.95);
    const mesh = new THREE.Mesh(geo, huskMat);
    mesh.position.set(xSign * 0.19, -0.14, 0);
    mesh.rotation.z = xSign * -0.18;
    mesh.castShadow = true;
    bodyGroup.add(mesh);
  }
  addCompanionFace(bodyGroup, 0.29, 0.12, 0.09, 0.85, false);
  return { baseY: 0.65, legSpread: 0.10, cuffMat: huskMat };
}

function buildLeek(bodyGroup) {
  const whiteMat = createPlushMaterial('#f4f2e4');
  const stalk = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.75, 14, 24), whiteMat);
  stalk.castShadow = true;
  bodyGroup.add(stalk);

  const greenMat = createPlushMaterial('#68ae5e');
  const greenMid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 24), greenMat);
  greenMid.position.y = 0.32;
  bodyGroup.add(greenMid);

  for (let i = -1; i <= 1; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.54, 12), greenMat);
    leaf.scale.set(1.1, 1.0, 0.35);
    leaf.position.set(i * 0.13, 0.62, 0);
    leaf.rotation.z = i * -0.35;
    leaf.castShadow = true;
    bodyGroup.add(leaf);
  }
  addCompanionFace(bodyGroup, 0.24, 0.0, 0.08, 0.8, false);
  return { baseY: 0.67, legSpread: 0.09, cuffMat: whiteMat };
}

function buildBartholomewBear(bodyGroup) {
  const furMat = createPlushMaterial('#9c6844', { bumpScale: 0.048 });
  const muzzleMat = createPlushMaterial('#cca37f');

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 28), furMat);
  torso.scale.set(1.04, 1.06, 0.96);
  torso.position.y = -0.06;
  torso.castShadow = true;
  bodyGroup.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.37, 32, 28), furMat);
  head.position.set(0, 0.46, 0.02);
  head.castShadow = true;
  bodyGroup.add(head);

  const earGeo = new THREE.SphereGeometry(0.125, 18, 16);
  earGeo.scale(1.0, 1.0, 0.6);
  const lEar = new THREE.Mesh(earGeo, furMat);
  lEar.position.set(-0.27, 0.74, 0.0);
  const rEar = lEar.clone();
  rEar.position.x = 0.27;
  bodyGroup.add(lEar, rEar);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.145, 20, 18), muzzleMat);
  muzzle.scale.set(1.1, 0.85, 0.85);
  muzzle.position.set(0, 0.40, 0.32);
  bodyGroup.add(muzzle);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 14), SharedMaterials.beadEye);
  nose.scale.set(1.2, 0.85, 0.8);
  nose.position.set(0, 0.44, 0.44);
  bodyGroup.add(nose);

  addCompanionFace(bodyGroup, 0.35, 0.48, 0.12, 0.85, false);
  return { baseY: 0.60, legSpread: 0.13, armMat: furMat, footMat: furMat, cuffMat: furMat, hasArms: true };
}

function buildBashfulBunny(bodyGroup) {
  const creamMat = createPlushMaterial('#f4ece0', { bumpScale: 0.042 });
  const earInnerMat = createPlushMaterial('#f7c6cf');

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.40, 30, 26), creamMat);
  torso.scale.set(0.95, 1.1, 0.95);
  torso.position.y = -0.08;
  torso.castShadow = true;
  bodyGroup.add(torso);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), creamMat);
  tail.position.set(0, -0.26, -0.36);
  bodyGroup.add(tail);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 30, 26), creamMat);
  head.position.set(0, 0.44, 0.02);
  head.castShadow = true;
  bodyGroup.add(head);

  const earPivot = new THREE.Group();
  earPivot.position.set(0, 0.64, 0);
  for (const xSign of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.50, 10, 16), creamMat);
    ear.scale.set(1.0, 1.0, 0.45);
    ear.position.set(xSign * 0.31, -0.14, -0.02);
    ear.rotation.z = xSign * -0.25;
    ear.castShadow = true;
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 10, 12), earInnerMat);
    inner.scale.set(1.0, 1.0, 0.3);
    inner.position.set(0, -0.03, 0.042);
    ear.add(inner);
    earPivot.add(ear);
  }
  bodyGroup.add(earPivot);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), createPlushMaterial('#ff9bb3'));
  nose.position.set(0, 0.42, 0.34);
  bodyGroup.add(nose);

  addCompanionFace(bodyGroup, 0.32, 0.46, 0.11, 0.8, true);
  return { baseY: 0.59, legSpread: 0.12, accessory: earPivot, armMat: creamMat, footMat: creamMat, cuffMat: creamMat, hasArms: true };
}

function buildCroissant(bodyGroup) {
  const pastryMat = createPlushMaterial('#df9945');
  const crustMat = createPlushMaterial('#c97b28');
  // Keep inner 3 segments aligned tightly around z = 0 so legs embed straight into bottom rolls!
  const segRadii = [0.16, 0.25, 0.31, 0.25, 0.16];
  const segX = [-0.38, -0.20, 0, 0.20, 0.38];
  const segZ = [-0.08, -0.01, 0, -0.01, -0.08];
  for (let i = 0; i < segRadii.length; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(segRadii[i], 24, 22), i % 2 === 0 ? pastryMat : crustMat);
    seg.scale.set(1.0, 0.92, 0.95);
    seg.position.set(segX[i], 0.04 - Math.abs(i - 2) * 0.02, segZ[i]);
    seg.castShadow = true;
    bodyGroup.add(seg);
  }
  addCompanionFace(bodyGroup, 0.28, 0.05, 0.11, 0.9, false);
  return { baseY: 0.34, legSpread: 0.13, cuffMat: pastryMat };
}

function buildCoffeeCup(bodyGroup) {
  const cupMat = createPlushMaterial('#f8f1e5');
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.29, 0.82, 32), cupMat);
  cup.castShadow = true;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.30, 0.36, 32), createPlushMaterial('#b07d56', { bumpScale: 0.04 }));
  sleeve.position.y = -0.02;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.35, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), createPlushMaterial('#fffdf9'));
  lid.position.y = 0.40;
  lid.castShadow = true;
  bodyGroup.add(cup, sleeve, lid);
  addCompanionFace(bodyGroup, 0.32, -0.02, 0.11, 0.9, false);
  return { baseY: 0.54, legSpread: 0.11, cuffMat: cupMat };
}

function buildBoiledEgg(bodyGroup) {
  const whiteMat = createPlushMaterial('#fff9f0');
  const eggGeo = new THREE.SphereGeometry(0.41, 32, 28);
  eggGeo.scale(0.95, 1.18, 0.92);
  const egg = new THREE.Mesh(eggGeo, whiteMat);
  egg.castShadow = true;
  const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.21, 24, 24), createPlushMaterial('#ffc738'));
  yolk.scale.set(1.0, 1.0, 0.45);
  yolk.position.set(0, -0.08, 0.33);
  bodyGroup.add(egg, yolk);
  addCompanionFace(bodyGroup, 0.36, 0.16, 0.10, 0.85, false);
  return { baseY: 0.55, legSpread: 0.115, cuffMat: whiteMat };
}

export function createJellycatCharacter(id, options = {}) {
  const root = new THREE.Group();
  root.name = `jellycat_${id}`;
  const scale = options.scale ?? 1.0;
  root.scale.setScalar(scale);

  const hipGroup = new THREE.Group();
  root.add(hipGroup);

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'torso_group';
  hipGroup.add(bodyGroup);

  const isLeglessAubergine = id === 'aubergine_standard' || id === 'aubergine_giant';

  let leftLeg = new THREE.Object3D();
  let rightLeg = new THREE.Object3D();
  let leftArm = new THREE.Object3D();
  let rightArm = new THREE.Object3D();
  let accessory = null;
  let baseBodyY = 0.65;

  if (id.startsWith('aubergine')) {
    const variant = id === 'aubergine_giant' ? 'giant' : id === 'aubergine_standard' ? 'standard' : 'charm';
    const mat = id === 'aubergine_baby' ? SharedMaterials.aubergineSoftMauve : SharedMaterials.aubergineMauve;
    const { calyxGroup, minLocalY } = buildOfficialAubergine(bodyGroup, variant, mat);
    accessory = calyxGroup;

    if (isLeglessAubergine) {
      baseBodyY = -minLocalY;
      bodyGroup.position.y = baseBodyY;
    } else {
      // Short plump legs: torso bottom sits right down at y = 0.14m wrapping top of legs!
      baseBodyY = 0.14 - minLocalY;
      bodyGroup.position.y = baseBodyY;
      const legs = addConnectedLegs(hipGroup, 0.115, SharedMaterials.charmCorduroyTan, mat);
      leftLeg = legs.leftLeg;
      rightLeg = legs.rightLeg;
    }

    addAubergineCostumeProps(id, bodyGroup, rightArm);
    if (id === 'aubergine_baby') {
      root.scale.multiplyScalar(0.76);
    }
  } else {
    let spec = { baseY: 0.58, legSpread: 0.12, accessory: null, armMat: null, footMat: SharedMaterials.charmCorduroyTan, cuffMat: SharedMaterials.aubergineMauve, hasArms: false };
    if (id === 'avocado') spec = { ...spec, ...buildAvocado(bodyGroup) };
    else if (id === 'tomato') spec = { ...spec, ...buildTomato(bodyGroup) };
    else if (id === 'sweetcorn') spec = { ...spec, ...buildSweetcorn(bodyGroup) };
    else if (id === 'leek') spec = { ...spec, ...buildLeek(bodyGroup) };
    else if (id === 'bartholomew_bear') spec = { ...spec, ...buildBartholomewBear(bodyGroup) };
    else if (id === 'bashful_bunny') spec = { ...spec, ...buildBashfulBunny(bodyGroup) };
    else if (id === 'croissant') spec = { ...spec, ...buildCroissant(bodyGroup) };
    else if (id === 'coffee_cup') spec = { ...spec, ...buildCoffeeCup(bodyGroup) };
    else if (id === 'boiled_egg') spec = { ...spec, ...buildBoiledEgg(bodyGroup) };

    accessory = spec.accessory;
    baseBodyY = spec.baseY;
    bodyGroup.position.y = baseBodyY;

    const legs = addConnectedLegs(
      hipGroup,
      spec.legSpread,
      spec.footMat || SharedMaterials.charmCorduroyTan,
      spec.cuffMat
    );
    leftLeg = legs.leftLeg;
    rightLeg = legs.rightLeg;

    if (spec.hasArms && spec.armMat) {
      const arms = addPlushArms(bodyGroup, spec.armMat, 0.34, 0.04);
      leftArm = arms.leftArm;
      rightArm = arms.rightArm;
    }
  }

  root.userData.rig = {
    hip: hipGroup,
    body: bodyGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    accessory,
    isLegless: isLeglessAubergine,
    baseBodyY,
    baseScale: root.scale.clone(),
  };

  return root;
}

export function animateJellycatRig(character, time, speed = 0, isJumping = false, isCheering = false) {
  const rig = character.userData?.rig;
  if (!rig) return;

  const moving = speed > 0.08;
  const phase = time * 9.5;

  if (moving && !isJumping) {
    if (rig.isLegless) {
      rig.hip.position.y = Math.abs(Math.sin(phase)) * 0.14;
      rig.body.rotation.z = Math.sin(phase) * 0.12;
      rig.body.rotation.x = 0.07;
      rig.body.scale.set(
        1 + Math.sin(phase * 2) * 0.035,
        1 - Math.sin(phase * 2) * 0.04,
        1 + Math.sin(phase * 2) * 0.035
      );
    } else {
      // Keep feet planted at ground (hip stays at y=0, slight bounce in step!)
      rig.hip.position.y = Math.abs(Math.sin(phase)) * 0.028;
      rig.leftLeg.rotation.x = Math.sin(phase) * 0.48;
      rig.rightLeg.rotation.x = -Math.sin(phase) * 0.48;
      rig.body.rotation.z = Math.sin(phase) * 0.05;
      rig.body.rotation.x = 0.03;
      rig.body.scale.set(
        1 + Math.sin(phase * 2) * 0.02,
        1 - Math.sin(phase * 2) * 0.02,
        1 + Math.sin(phase * 2) * 0.02
      );
      rig.leftArm.rotation.x = -Math.sin(phase) * 0.40;
      rig.rightArm.rotation.x = Math.sin(phase) * 0.40;
    }
  } else if (isJumping) {
    rig.leftLeg.rotation.x = 0.35;
    rig.rightLeg.rotation.x = -0.35;
    rig.hip.position.y = 0;
    rig.body.rotation.z = 0;
    rig.body.rotation.x = 0;
    rig.body.scale.set(0.95, 1.06, 0.95);
    rig.leftArm.rotation.z = -1.1;
    rig.rightArm.rotation.z = 1.1;
  } else {
    // Feet ALWAYS stay firmly planted on ground (hip = 0, body anchored inside hip!)
    const breath = Math.sin(time * 2.5);
    rig.leftLeg.rotation.x *= 0.85;
    rig.rightLeg.rotation.x *= 0.85;
    rig.hip.position.y = 0;
    rig.body.position.y = rig.baseBodyY;
    rig.body.rotation.z = Math.sin(time * 1.4) * 0.02;
    rig.body.rotation.x *= 0.85;
    rig.body.scale.set(1 - breath * 0.015, 1 + breath * 0.015, 1 - breath * 0.015);
    rig.leftArm.rotation.x *= 0.85;
    rig.rightArm.rotation.x *= 0.85;
  }

  if (isCheering) {
    // Happy side-to-side plush wiggle with feet grounded (NO floating!)
    rig.hip.position.y = 0;
    rig.body.rotation.z = Math.sin(time * 7) * 0.11;
    rig.leftArm.rotation.z = -1.5 + Math.sin(time * 10) * 0.22;
    rig.rightArm.rotation.z = 1.5 - Math.sin(time * 10) * 0.22;
  }

  if (rig.accessory) {
    rig.accessory.rotation.x = Math.sin(time * 4.5) * (moving ? 0.09 : 0.03);
  }
}

let glbPrecompiler = null;

export function setGlbCompiler(fn) {
  glbPrecompiler = fn;
}

export async function loadComfyGLB(url, targetHeight = 1.4) {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) return null;
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      async (gltf) => {
        const model = gltf.scene;
        const castSh = !(typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = castSh;
            child.receiveShadow = true;
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.y, 0.001);
        const scale = targetHeight / maxDim;
        model.scale.setScalar(scale);

        const wrapper = new THREE.Group();
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        wrapper.add(model);

        wrapper.userData.rig = {
          hip: wrapper,
          body: model,
          leftLeg: new THREE.Object3D(),
          rightLeg: new THREE.Object3D(),
          leftArm: new THREE.Object3D(),
          rightArm: new THREE.Object3D(),
          accessory: null,
          isLegless: true,
          baseBodyY: model.position.y,
          baseScale: model.scale.clone(),
        };
        if (glbPrecompiler) {
          try {
            await glbPrecompiler(wrapper);
          } catch {}
        }
        resolve(wrapper);
      },
      undefined,
      () => resolve(null)
    );
  });
}
