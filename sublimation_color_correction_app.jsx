import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, RefreshCcw, Wand2, Eye, Printer, Info, Sparkles, SunMedium, Palette, SlidersHorizontal, CheckCircle2, Image as ImageIcon, Stars, Zap } from "lucide-react";

const clamp = (v, min = 0, max = 255) => Math.max(min, Math.min(max, v));

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r;
  let g;
  let b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function computeStats(imageData) {
  const d = imageData.data;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let lumSum = 0;
  const hist = new Array(16).fill(0);

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum;
    hist[Math.min(15, Math.floor((lum / 256) * 16))] += 1;
  }

  const n = d.length / 4;
  return {
    avgR: rSum / n,
    avgG: gSum / n,
    avgB: bSum / n,
    avgLum: lumSum / n,
    hist,
  };
}

function getAutoSettings(stats) {
  const { avgR, avgG, avgB, avgLum } = stats;
  const avgRGB = (avgR + avgG + avgB) / 3;
  const castRB = (avgR - avgB) / 255;
  const castG = (avgG - avgRGB) / 255;

  const brightness = avgLum > 150 ? -6 : avgLum < 95 ? 8 : 0;
  const contrast = avgLum > 155 ? 6 : 12;
  const saturation = 10;
  const gamma = avgLum > 145 ? 1.08 : 0.96;
  const warmth = clamp(-castRB * 18, -20, 20);
  const magenta = clamp(-castG * 22, -20, 20);

  return {
    brightness,
    contrast,
    saturation,
    gamma,
    warmth,
    magenta,
    blackPoint: 4,
    whitePoint: 250,
  };
}

function applyCorrectionToImageData(sourceImageData, settings, enhanceOptions = { enabled: false, strength: 35 }) {
  const out = new ImageData(sourceImageData.width, sourceImageData.height);
  const src = sourceImageData.data;
  const dst = out.data;

  const brightness = settings.brightness ?? 0;
  const contrast = settings.contrast ?? 0;
  const saturation = settings.saturation ?? 0;
  const warmth = settings.warmth ?? 0;
  const magenta = settings.magenta ?? 0;
  const gamma = settings.gamma ?? 1;
  const blackPoint = settings.blackPoint ?? 0;
  const whitePoint = settings.whitePoint ?? 255;
  const enhanceEnabled = enhanceOptions.enabled ?? false;
  const enhanceStrength = enhanceOptions.strength ?? 35;

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast || 0.0001));
  const wpRange = Math.max(1, whitePoint - blackPoint);

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i];
    let g = src[i + 1];
    let b = src[i + 2];
    const a = src[i + 3];

    r = ((r - blackPoint) * 255) / wpRange;
    g = ((g - blackPoint) * 255) / wpRange;
    b = ((b - blackPoint) * 255) / wpRange;

    r += brightness;
    g += brightness;
    b += brightness;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    r += warmth;
    b -= warmth;
    r += magenta * 0.35;
    b += magenta * 0.35;
    g -= magenta * 0.45;

    r = 255 * Math.pow(clamp(r) / 255, 1 / gamma);
    g = 255 * Math.pow(clamp(g) / 255, 1 / gamma);
    b = 255 * Math.pow(clamp(b) / 255, 1 / gamma);

    let [h, s, l] = rgbToHsl(clamp(r), clamp(g), clamp(b));
    s = Math.max(0, Math.min(1, s * (1 + saturation / 100)));

    if (enhanceEnabled) {
      const strength = enhanceStrength / 100;
      s = Math.max(0, Math.min(1, s * (1 + 0.22 * strength)));
      l = Math.max(0, Math.min(1, l + (l < 0.45 ? 0.04 * strength : -0.015 * strength)));
    }

    [r, g, b] = hslToRgb(h, s, l);

    if (enhanceEnabled) {
      const strength = enhanceStrength / 100;
      const mid = 128;
      r = mid + (r - mid) * (1 + 0.18 * strength);
      g = mid + (g - mid) * (1 + 0.18 * strength);
      b = mid + (b - mid) * (1 + 0.18 * strength);

      const liftShadows = (v) => {
        const n = v / 255;
        const lifted = n < 0.35 ? n + 0.06 * strength : n;
        const protectedHigh = lifted > 0.9 ? 0.9 + (lifted - 0.9) * (1 - 0.35 * strength) : lifted;
        return protectedHigh * 255;
      };

      r = liftShadows(r);
      g = liftShadows(g);
      b = liftShadows(b);
    }

    dst[i] = clamp(r);
    dst[i + 1] = clamp(g);
    dst[i + 2] = clamp(b);
    dst[i + 3] = a;
  }

  return out;
}

function applyPrintPreviewToCanvas(sourceCanvas, targetCanvas) {
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const tgt = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || !tgt) return;

  const { width, height } = sourceCanvas;
  targetCanvas.width = width;
  targetCanvas.height = height;

  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r = Math.pow(r, 1.08) * 0.96;
    g = Math.pow(g, 1.08) * 0.96;
    b = Math.pow(b, 1.08) * 0.96;

    const [h, s, l] = rgbToHsl(clamp(r * 255), clamp(g * 255), clamp(b * 255));
    const satReduced = Math.max(0, Math.min(1, s * 0.93));
    const [rr, gg, bb] = hslToRgb(h, satReduced, l);

    d[i] = rr;
    d[i + 1] = gg;
    d[i + 2] = bb;
  }

  tgt.putImageData(imageData, 0, 0);
}

function drawHistogram(canvas, hist) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = (canvas.width = 320);
  const h = (canvas.height = 120);
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...hist, 1);
  const barW = w / hist.length;

  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, "#60a5fa");
  gradient.addColorStop(0.5, "#a78bfa");
  gradient.addColorStop(1, "#f472b6");

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = gradient;

  hist.forEach((v, i) => {
    const bh = (v / max) * (h - 16);
    ctx.fillRect(i * barW + 2, h - bh - 8, barW - 4, bh);
  });
}

function CompareSlider({ title, subtitle, originalPreviewUrl, correctedPreviewUrl, loaded }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updateFromClientX = (clientX) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, next)));
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (typeof e.clientX === "number") updateFromClientX(e.clientX);
      if (e.touches?.[0]) updateFromClientX(e.touches[0].clientX);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  const hasPreview = loaded && originalPreviewUrl && correctedPreviewUrl;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="rounded-[28px] border-0 shadow-xl overflow-hidden bg-white/75 backdrop-blur">
        <div className="h-2 w-full bg-gradient-to-r from-sky-400 via-violet-500 to-pink-500" />
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">{title}</CardTitle>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <div
            ref={containerRef}
            className="relative rounded-[24px] overflow-hidden border border-slate-100 bg-gradient-to-br from-slate-50 to-white shadow-inner select-none"
            onMouseDown={(e) => {
              if (!hasPreview) return;
              setDragging(true);
              updateFromClientX(e.clientX);
            }}
            onTouchStart={(e) => {
              if (!hasPreview) return;
              setDragging(true);
              if (e.touches?.[0]) updateFromClientX(e.touches[0].clientX);
            }}
          >
            <div className="relative aspect-[16/10] min-h-[360px] md:min-h-[520px] bg-white">
              {hasPreview ? (
                <>
                  <img
                    src={originalPreviewUrl}
                    alt="Original preview"
                    className="absolute inset-0 w-full h-full object-contain"
                    draggable={false}
                  />

                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
                  >
                    <img
                      src={correctedPreviewUrl}
                      alt="Corrected preview"
                      className="absolute inset-0 w-full h-full object-contain"
                      draggable={false}
                    />
                  </div>

                  <div className="absolute top-4 left-4 rounded-full bg-white/90 backdrop-blur px-3 py-1 text-xs font-semibold text-slate-700 shadow">
                    Original
                  </div>
                  <div className="absolute top-4 right-4 rounded-full bg-violet-600/90 backdrop-blur px-3 py-1 text-xs font-semibold text-white shadow">
                    Edited
                  </div>
                  <div className="absolute inset-y-0" style={{ left: `${position}%`, transform: "translateX(-50%)" }}>
                    <div className="relative h-full w-[3px] bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.75)]">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white border-4 border-violet-500 shadow-xl flex items-center justify-center">
                        <div className="flex items-center gap-1 text-violet-600 font-bold text-sm">
                          <span>‹</span>
                          <span>›</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-slate-400 pointer-events-none">
                  Upload a photo to compare the original and edited result with the slider.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ControlRow({ label, value, min, max, step = 1, onChange, icon }) {
  return (
    <div className="space-y-2 rounded-2xl bg-white/70 p-4 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between text-sm gap-3">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-slate-500">{typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}

function StepCard({ number, title, text }) {
  return (
    <div className="rounded-2xl bg-white/70 border border-white/60 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {number}
        </div>
        <div>
          <p className="font-semibold text-slate-800">{title}</p>
          <p className="text-sm text-slate-500 mt-1">{text}</p>
        </div>
      </div>
    </div>
  );
}

export default function SublimationColorCorrectionApp() {
  const originalCanvasRef = useRef(null);
  const correctedCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const histCanvasRef = useRef(null);
  const sourceImageRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState(null);
  const [autoApplied, setAutoApplied] = useState(false);
  const [settings, setSettings] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    warmth: 0,
    magenta: 0,
    gamma: 1,
    blackPoint: 0,
    whitePoint: 255,
  });
  const [enhanceEnabled, setEnhanceEnabled] = useState(false);
  const [enhanceStrength, setEnhanceStrength] = useState(35);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState("");
  const [correctedPreviewUrl, setCorrectedPreviewUrl] = useState("");

  const assessment = useMemo(() => {
    if (!stats) return null;
    const neutralDrift = stats.avgR - stats.avgB;
    const greenDrift = stats.avgG - (stats.avgR + stats.avgB) / 2;

    let tone = "Balanced";
    if (stats.avgLum > 160) tone = "Screen-bright";
    else if (stats.avgLum < 90) tone = "Dark image";

    let cast = "Neutral";
    if (neutralDrift > 8) cast = "Warm";
    if (neutralDrift < -8) cast = "Cool";
    if (greenDrift > 8) cast = "Green-biased";
    if (greenDrift < -8) cast = "Magenta-biased";

    return { tone, cast };
  }, [stats]);

  const syncCanvasSize = (img, canvas) => {
    const maxDim = 1200;
    let { width, height } = img;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    canvas.width = width;
    canvas.height = height;
    return { width, height };
  };

  const renderPipeline = useCallback(() => {
    const img = sourceImageRef.current;
    const originalCanvas = originalCanvasRef.current;
    const correctedCanvas = correctedCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    const histCanvas = histCanvasRef.current;
    if (!img || !originalCanvas || !correctedCanvas || !previewCanvas) return;

    const octx = originalCanvas.getContext("2d", { willReadFrequently: true });
    const cctx = correctedCanvas.getContext("2d", { willReadFrequently: true });
    if (!octx || !cctx) return;

    const size = syncCanvasSize(img, originalCanvas);
    correctedCanvas.width = size.width;
    correctedCanvas.height = size.height;

    octx.clearRect(0, 0, size.width, size.height);
    octx.drawImage(img, 0, 0, size.width, size.height);

    const srcData = octx.getImageData(0, 0, size.width, size.height);
    const corrected = applyCorrectionToImageData(srcData, settings, { enabled: enhanceEnabled, strength: enhanceStrength });
    cctx.putImageData(corrected, 0, 0);

    applyPrintPreviewToCanvas(correctedCanvas, previewCanvas);

    const currentStats = computeStats(corrected);
    if (histCanvas) drawHistogram(histCanvas, currentStats.hist);

    setOriginalPreviewUrl(originalCanvas.toDataURL("image/png"));
    setCorrectedPreviewUrl(correctedCanvas.toDataURL("image/png"));
  }, [settings, enhanceEnabled, enhanceStrength]);

  useEffect(() => {
    if (loaded) renderPipeline();
  }, [loaded, settings, renderPipeline]);

  const loadFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        sourceImageRef.current = img;

        const tempCanvas = document.createElement("canvas");
        const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
        const size = syncCanvasSize(img, tempCanvas);
        tempCtx.drawImage(img, 0, 0, size.width, size.height);
        const imageData = tempCtx.getImageData(0, 0, size.width, size.height);
        const baseStats = computeStats(imageData);
        setStats(baseStats);
        setSettings(getAutoSettings(baseStats));
        setFileName(file.name);
        setLoaded(true);
        setAutoApplied(true);
      };
      img.src = e.target?.result;
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    loadFile(file);
  };

  const resetControls = () => {
    if (!stats) return;
    setSettings(getAutoSettings(stats));
    setAutoApplied(true);
  };

  const exportPNG = () => {
    const canvas = correctedCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "corrected"}-sublimation.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const readiness = loaded ? 100 : 20;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_30%),radial-gradient(circle_at_top_right,_#fae8ff,_transparent_28%),radial-gradient(circle_at_bottom,_#dcfce7,_transparent_30%),linear-gradient(180deg,_#f8fafc,_#eef2ff)] text-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="rounded-[32px] overflow-hidden shadow-2xl border border-white/60 bg-white/65 backdrop-blur-xl">
          <div className="bg-gradient-to-r from-sky-500 via-violet-500 to-pink-500 p-8 md:p-10 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_20%_20%,white,transparent_25%),radial-gradient(circle_at_80%_30%,white,transparent_22%),radial-gradient(circle_at_50%_80%,white,transparent_20%)]" />
            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-medium mb-4">
                  <Sparkles className="h-4 w-4" /> Easy photo balancing for sublimation printing
                </div>
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">Colour Correction Studio</h1>
                <p className="mt-3 text-white/90 text-base md:text-lg leading-7">
                  Upload a photo, let the app automatically balance it for sublimation printing, compare the result, and export a cleaner print-ready version.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 min-w-[260px]">
                <div className="rounded-2xl bg-white/18 p-4 backdrop-blur">
                  <p className="text-sm text-white/80">Best for</p>
                  <p className="font-bold mt-1">Mugs, shirts, panels</p>
                </div>
                <div className="rounded-2xl bg-white/18 p-4 backdrop-blur">
                  <p className="text-sm text-white/80">Mode</p>
                  <p className="font-bold mt-1">Auto + Enhance</p>
                </div>
                <div className="rounded-2xl bg-white/18 p-4 backdrop-blur">
                  <p className="text-sm text-white/80">Preview</p>
                  <p className="font-bold mt-1">Print simulation</p>
                </div>
                <div className="rounded-2xl bg-white/18 p-4 backdrop-blur">
                  <p className="text-sm text-white/80">Export</p>
                  <p className="font-bold mt-1">PNG download</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-4 space-y-6">
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
              <Card className="rounded-[28px] border-0 shadow-xl bg-white/75 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><Upload className="h-5 w-5 text-sky-500" /> Upload your image</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <label className="block rounded-3xl border-2 border-dashed border-violet-200 bg-gradient-to-br from-sky-50 to-fuchsia-50 p-6 text-center cursor-pointer hover:from-sky-100 hover:to-fuchsia-100 transition">
                    <div className="mx-auto h-14 w-14 rounded-2xl bg-white shadow flex items-center justify-center mb-3">
                      <ImageIcon className="h-7 w-7 text-violet-500" />
                    </div>
                    <p className="font-semibold text-slate-700">Choose a photo to upload</p>
                    <p className="text-sm text-slate-500 mt-1">JPG, PNG, or other image files</p>
                    <Input className="hidden" type="file" accept="image/*" onChange={onFileChange} />
                  </label>

                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-slate-600">Workflow status</span>
                      <span className="font-medium text-slate-700">{loaded ? "Ready to export" : "Waiting for upload"}</span>
                    </div>
                    <Progress value={readiness} className="h-3" />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={resetControls} variant="outline" disabled={!loaded} className="rounded-full">
                      <RefreshCcw className="h-4 w-4 mr-2" /> Auto fix
                    </Button>
                    <Button onClick={exportPNG} disabled={!loaded} className="rounded-full bg-gradient-to-r from-sky-500 to-violet-500 text-white border-0">
                      <Download className="h-4 w-4 mr-2" /> Export PNG
                    </Button>
                  </div>

                  {fileName ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-emerald-800">Image loaded</p>
                        <p className="text-sm text-emerald-700 mt-1 break-all">{fileName}</p>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <Card className="rounded-[28px] border-0 shadow-xl bg-white/75 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl"><SlidersHorizontal className="h-5 w-5 text-fuchsia-500" /> Simple controls</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="auto" className="w-full">
                    <TabsList className="grid grid-cols-3 w-full rounded-2xl bg-slate-100 p-1">
                      <TabsTrigger value="auto" className="rounded-xl">Auto</TabsTrigger>
                      <TabsTrigger value="manual" className="rounded-xl">Manual</TabsTrigger>
                      <TabsTrigger value="enhance" className="rounded-xl">Enhance</TabsTrigger>
                    </TabsList>
                    <TabsContent value="auto" className="pt-4 space-y-4">
                      <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 p-4 text-sm text-slate-600 leading-6 border border-sky-100">
                        Auto mode checks brightness and colour cast, then adjusts the photo to better match how it may look once printed rather than how it looks on a backlit screen.
                      </div>
                      <Button className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white border-0" onClick={resetControls} disabled={!loaded}>
                        <Wand2 className="h-4 w-4 mr-2" /> Re-run automatic balancing
                      </Button>
                      {autoApplied && loaded && (
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-700">
                          Automatic print-friendly correction has been applied.
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value="enhance" className="pt-4 space-y-4">
                      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-pink-50 p-4 text-sm text-slate-600 leading-6 border border-amber-100">
                        Optional photo enhancement gives images a cleaner, richer look with more clarity and pop, similar to one-tap enhancement tools. It stays gentle so it still works alongside sublimation correction.
                      </div>
                      <div className="rounded-2xl bg-white/70 p-4 border border-slate-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-800 flex items-center gap-2"><Stars className="h-4 w-4 text-pink-500" /> Smart enhance</p>
                            <p className="text-sm text-slate-500 mt-1">Turn enhancement on or off for a more polished photo look.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEnhanceEnabled((v) => !v)}
                            className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${enhanceEnabled ? "bg-gradient-to-r from-pink-500 to-violet-500" : "bg-slate-300"}`}
                          >
                            <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${enhanceEnabled ? "translate-x-7" : "translate-x-1"}`} />
                          </button>
                        </div>
                        <ControlRow label="Enhance strength" value={enhanceStrength} min={0} max={100} onChange={(v) => setEnhanceStrength(v)} icon={<Zap className="h-4 w-4 text-amber-500" />} />
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-700">
                          Best for portraits, soft images, and photos that need extra clarity.
                        </div>
                        <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4 text-sm text-sky-700">
                          Keep strength low for logos, artwork, and flat graphics so they stay natural.
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="manual" className="pt-4">
                      <div className="space-y-4">
                        <ControlRow label="Brightness" value={settings.brightness} min={-40} max={40} onChange={(v) => setSettings((s) => ({ ...s, brightness: v }))} icon={<SunMedium className="h-4 w-4 text-amber-500" />} />
                        <ControlRow label="Contrast" value={settings.contrast} min={-50} max={50} onChange={(v) => setSettings((s) => ({ ...s, contrast: v }))} icon={<Sparkles className="h-4 w-4 text-violet-500" />} />
                        <ControlRow label="Saturation" value={settings.saturation} min={-50} max={50} onChange={(v) => setSettings((s) => ({ ...s, saturation: v }))} icon={<Palette className="h-4 w-4 text-pink-500" />} />
                        <ControlRow label="Warmth" value={settings.warmth} min={-30} max={30} onChange={(v) => setSettings((s) => ({ ...s, warmth: v }))} icon={<SunMedium className="h-4 w-4 text-orange-500" />} />
                        <ControlRow label="Magenta / Green" value={settings.magenta} min={-30} max={30} onChange={(v) => setSettings((s) => ({ ...s, magenta: v }))} icon={<Palette className="h-4 w-4 text-fuchsia-500" />} />
                        <ControlRow label="Gamma" value={settings.gamma} min={0.7} max={1.4} step={0.01} onChange={(v) => setSettings((s) => ({ ...s, gamma: v }))} icon={<Sparkles className="h-4 w-4 text-sky-500" />} />
                        <ControlRow label="Black Point" value={settings.blackPoint} min={0} max={40} onChange={(v) => setSettings((s) => ({ ...s, blackPoint: v }))} icon={<Eye className="h-4 w-4 text-slate-600" />} />
                        <ControlRow label="White Point" value={settings.whitePoint} min={215} max={255} onChange={(v) => setSettings((s) => ({ ...s, whitePoint: v }))} icon={<Printer className="h-4 w-4 text-slate-600" />} />
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45 }}>
              <Card className="rounded-[28px] border-0 shadow-xl bg-white/75 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-xl">Quick guidance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StepCard number="1" title="Upload your photo" text="Start by dropping in the image you want to prepare for sublimation printing." />
                  <StepCard number="2" title="Check the corrected version" text="The app applies an automatic balance to reduce the screen-to-print mismatch." />
                  <StepCard number="3" title="Fine-tune or enhance" text="Use the colourful sliders or switch on Smart Enhance for extra polish and clarity." />
                  <StepCard number="4" title="Export and test print" text="Download the corrected image and compare it to a real printed sample." />
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="xl:col-span-8 space-y-6">
            <Alert className="rounded-[28px] border-0 shadow-lg bg-white/75 backdrop-blur">
              <Info className="h-4 w-4 text-sky-500" />
              <AlertDescription className="text-slate-600">
                This tool is designed to be easy to use and visually friendly. For perfect production matching, pair it with printer profiles and test prints for your specific ink, paper, and substrate.
              </AlertDescription>
            </Alert>

            <CompareSlider
              title={<span className="flex items-center gap-2"><Stars className="h-5 w-5 text-violet-500" /> Before & After Preview</span>}
              subtitle="Drag the center line left and right to compare the original image with the corrected result."
              originalPreviewUrl={originalPreviewUrl}
              correctedPreviewUrl={correctedPreviewUrl}
              loaded={loaded}
            />

            <Card className="rounded-[28px] border-0 shadow-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white overflow-hidden">
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  <div>
                    <p className="text-white/80 text-sm font-medium uppercase tracking-[0.2em]">Final file</p>
                    <h3 className="text-2xl md:text-3xl font-extrabold mt-2">Download your corrected image</h3>
                    <p className="text-white/90 mt-2 max-w-2xl">
                      Export the final corrected file as a PNG ready for your sublimation workflow.
                    </p>
                  </div>
                  <Button onClick={exportPNG} disabled={!loaded} className="rounded-full bg-white text-violet-700 hover:bg-white/90 h-14 px-8 text-base font-bold shadow-xl">
                    <Download className="h-5 w-5 mr-2" /> Download Final File
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="rounded-[28px] border-0 shadow-xl bg-white/75 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-xl">Image assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {assessment ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-cyan-50 p-4 border border-sky-100">
                          <p className="text-xs uppercase tracking-wide text-sky-600">Tone</p>
                          <p className="font-bold text-slate-800 mt-2 text-lg">{assessment.tone}</p>
                        </div>
                        <div className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-pink-50 p-4 border border-fuchsia-100">
                          <p className="text-xs uppercase tracking-wide text-fuchsia-600">Colour cast</p>
                          <p className="font-bold text-slate-800 mt-2 text-lg">{assessment.cast}</p>
                        </div>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-sm font-semibold mb-3 text-slate-700">Luminance histogram</p>
                        <canvas ref={histCanvasRef} className="w-full rounded-2xl border border-slate-100 shadow-sm" />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
                      Upload an image to see the assessment and histogram.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-0 shadow-xl bg-white/75 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-xl">Helpful tips</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600 leading-7">
                  <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 border border-amber-100">
                    Use the center slider in the preview to reveal the original and edited image, similar to a before-and-after photo comparison tool.
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 border border-violet-100">
                    Start with the automatic correction, then make tiny manual changes rather than big ones.
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-pink-50 to-rose-50 p-4 border border-pink-100">
                    Smart Enhance can make photos look clearer and richer, especially portraits and softer images.
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 p-4 border border-emerald-100">
                    Save test versions and compare them with real printed output for your own printer setup.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
