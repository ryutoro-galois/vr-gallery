/* global AFRAME, THREE */

// 展示物：ホバーで発光、クリック（マウス／トリガー）で選択イベントを発行
// 基本図形にも gltf-model にも付けられる。audio を指定すると選択時に解説音声を流す
AFRAME.registerComponent('exhibit', {
  schema: {
    title: { type: 'string' },
    body: { type: 'string' },
    color: { type: 'color', default: '#7fdcff' },
    audio: { type: 'string' }
  },

  init: function () {
    this.hoverCount = 0;
    this.el.classList.add('clickable');

    this.el.addEventListener('mouseenter', () => {
      this.hoverCount++;
      this.setGlow(true);
    });
    this.el.addEventListener('mouseleave', () => {
      this.hoverCount = Math.max(0, this.hoverCount - 1);
      if (this.hoverCount === 0) this.setGlow(false);
    });
    this.el.addEventListener('click', (evt) => {
      pulse(evt.detail && evt.detail.cursorEl);
      this.el.sceneEl.emit('exhibit-selected', { el: this.el, data: this.data });
    });
  },

  // メッシュのマテリアルを直接光らせる（3Dモデルの元の発光色は覚えておいて戻す）
  setGlow: function (on) {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) return;
    mesh.traverse((node) => {
      [].concat(node.material || []).forEach((m) => {
        if (!m.emissive) return;
        const base = m.userData.baseEmissive ||
          (m.userData.baseEmissive = { color: m.emissive.clone(), intensity: m.emissiveIntensity });
        if (on) {
          m.emissive.set(this.data.color);
          m.emissiveIntensity = 0.35;
        } else {
          m.emissive.copy(base.color);
          m.emissiveIntensity = base.intensity;
        }
      });
    });
  }
});

// 3Dモデルを指定サイズ（最大辺の長さ, m）に縮尺し、底面の中心をエンティティの原点に合わせる
AFRAME.registerComponent('fit-size', {
  schema: { type: 'number', default: 0.5 },

  init: function () {
    this.el.addEventListener('model-loaded', () => this.fit());
  },

  fit: function () {
    const mesh = this.el.getObject3D('mesh');
    const obj = this.el.object3D;
    if (!mesh) return;

    // 回転アニメーションの影響を受けないよう、一時的に回転・拡大を戻して測る
    const quaternion = obj.quaternion.clone();
    const scale = obj.scale.clone();
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
    mesh.position.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    obj.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const origin = obj.getWorldPosition(new THREE.Vector3());
    const k = this.data / (Math.max(size.x, size.y, size.z) || 1);
    mesh.scale.setScalar(k);
    mesh.position.set((origin.x - center.x) * k, (origin.y - box.min.y) * k, (origin.z - center.z) * k);

    obj.quaternion.copy(quaternion);
    obj.scale.copy(scale);
  }
});

// 説明パネル：Canvasテクスチャに日本語を描き、選んだ展示物の上に利用者向きで表示
AFRAME.registerComponent('info-panel', {
  dependencies: ['geometry', 'material'],

  init: function () {
    this.current = null;
    this.audio = new Audio();
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.el.getObject3D('mesh').material.map = this.texture;
    this.el.getObject3D('mesh').material.needsUpdate = true;

    this.show({
      title: 'ようこそ',
      body: '展示物にレーザー（PCではマウス）を向けて、トリガー（クリック）で説明を表示します。その場で見回してください。',
      color: '#7fdcff'
    });
    this.faceCamera();

    this.el.addEventListener('click', (evt) => {
      pulse(evt.detail && evt.detail.cursorEl);
      this.hide();
    });
    this.el.sceneEl.addEventListener('exhibit-selected', (evt) => {
      const { el, data } = evt.detail;
      if (this.current === el && this.el.object3D.visible) { this.hide(); return; }
      this.current = el;
      this.show(data);
      this.placeAbove(el);
      this.playAudio(data.audio, el);
    });
  },

  show: function (data) {
    drawCard(this.canvas, data);
    this.texture.needsUpdate = true;
    this.el.object3D.visible = true;
    this.el.classList.add('clickable');
  },

  hide: function () {
    this.current = null;
    this.playAudio('');
    this.el.object3D.visible = false;
    this.el.classList.remove('clickable');
  },

  // 解説音声：1つの Audio を使い回し、別の展示物を選んだら切り替え、閉じたら止める。
  // Web Audio の PositionalAudio に通し、選んだ展示物の位置から聞こえるようにする
  playAudio: function (src, target) {
    this.audio.pause();
    if (!src) return;
    const sound = this.getSpatialSound();
    target.object3D.add(sound);
    // AudioContext はユーザー操作（クリック／トリガー）の中で再開する必要がある
    sound.context.resume();
    this.audio.src = src;
    this.audio.currentTime = 0;
    this.audio.play().catch((err) => console.warn('解説音声を再生できませんでした:', err.message));
  },

  // 初回の再生時に作る（ページを開いた直後に AudioContext を作ると、ブラウザに止められるため）
  getSpatialSound: function () {
    if (this.sound) return this.sound;
    const scene = this.el.sceneEl;
    // A-Frame の sound コンポーネントと同じく、リスナーはカメラに付けて頭の向きに追従させる
    const listener = scene.audioListener || (scene.audioListener = new THREE.AudioListener());
    if (listener.parent !== scene.camera) scene.camera.add(listener);
    scene.addEventListener('camera-set-active', () => scene.camera.add(listener));

    this.sound = new THREE.PositionalAudio(listener);
    this.sound.setMediaElementSource(this.audio);
    // 立ち位置から展示物まで約2.2m。距離で小さくなりすぎないよう減衰をゆるめにする
    this.sound.setDistanceModel('inverse');
    this.sound.setRefDistance(1.5);
    this.sound.setRolloffFactor(0.8);
    return this.sound;
  },

  placeAbove: function (target) {
    const p = new THREE.Vector3();
    target.object3D.getWorldPosition(p);
    // 展示物から立ち位置（原点）方向へ少し寄せ、頭より少し上に置く
    const toUser = new THREE.Vector3(-p.x, 0, -p.z).normalize().multiplyScalar(0.3);
    this.el.object3D.position.set(p.x + toUser.x, 1.95, p.z + toUser.z);
    this.faceCamera();
  },

  faceCamera: function () {
    const cam = this.el.sceneEl.camera;
    const target = new THREE.Vector3(0, 1.6, 0);
    if (cam) cam.getWorldPosition(target);
    this.el.object3D.lookAt(target);
  }
});

function drawCard(canvas, data) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, pad = 56;
  const font = 'system-ui, "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", sans-serif';

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(17, 21, 28, 0.92)';
  roundRect(ctx, 0, 0, w, h, 40);
  ctx.fill();
  ctx.fillStyle = data.color || '#7fdcff';
  roundRect(ctx, 0, 0, 18, h, 9);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 60px ' + font;
  ctx.fillText(data.title, pad, pad, w - pad * 2);

  ctx.fillStyle = '#d4dae4';
  ctx.font = '38px ' + font;
  const lines = wrapText(ctx, data.body, w - pad * 2);
  lines.slice(0, 6).forEach((line, i) => ctx.fillText(line, pad, pad + 96 + i * 56));

  ctx.fillStyle = '#8a93a3';
  ctx.font = '26px ' + font;
  ctx.fillText(data.audio ? '解説音声を再生中 ・ パネルを選択すると閉じて停止します' : 'パネルを選択すると閉じます',
    pad, h - pad - 26);
}

// 日本語は文字単位で折り返す
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 選択時にコントローラーを短く振動させる（非対応なら何もしない）
function pulse(cursorEl) {
  try {
    const tc = cursorEl && cursorEl.components['tracked-controls'];
    const gp = tc && tc.controller && tc.controller.gamepad;
    const actuator = gp && gp.hapticActuators && gp.hapticActuators[0];
    if (actuator) actuator.pulse(0.4, 40);
  } catch (e) { /* noop */ }
}

// VR開始ボタン
document.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  const button = document.getElementById('enter-vr');
  const status = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const camera = document.getElementById('camera');

  if (!window.isSecureContext) {
    status.textContent = 'VRにはHTTPS（またはlocalhost）での公開が必要です。';
  } else if (!navigator.xr) {
    status.textContent = 'このブラウザはWebXR非対応です（PCではマウスで操作できます）。';
  } else {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      button.disabled = !ok;
      status.textContent = ok ? '準備完了' : 'VRヘッドセットが見つかりません（マウスで操作できます）。';
    }).catch(() => { status.textContent = 'WebXRの確認に失敗しました。'; });
  }

  button.addEventListener('click', () => {
    const enter = () => scene.enterVR().catch((err) => {
      status.textContent = 'VRを開始できませんでした：' + err.message;
    });
    if (scene.hasLoaded) enter(); else scene.addEventListener('loaded', enter, { once: true });
  });

  // VR中はマウス用レイキャストを止める（残留ホバー防止）
  scene.addEventListener('enter-vr', () => {
    overlay.style.display = 'none';
    camera.setAttribute('raycaster', 'enabled', false);
  });
  scene.addEventListener('exit-vr', () => {
    overlay.style.display = '';
    camera.setAttribute('raycaster', 'enabled', true);
  });
});
