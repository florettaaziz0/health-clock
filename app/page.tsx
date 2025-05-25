"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Play, Pause, RotateCcw, Settings } from "lucide-react"

type TimerState = "idle" | "working" | "resting"
type TimeUnit = "hours" | "minutes" | "seconds"

interface TimerSettings {
  workDuration: number
  workUnit: TimeUnit
  restDuration: number
  restUnit: TimeUnit
  workReminders: number
  restReminders: number
}

export default function HealthClock() {
  const [settings, setSettings] = useState<TimerSettings>({
    workDuration: 25,
    workUnit: "minutes",
    restDuration: 5,
    restUnit: "minutes",
    workReminders: 3,
    restReminders: 3,
  })

  const [timerState, setTimerState] = useState<TimerState>("idle")
  const [timeLeft, setTimeLeft] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [dialogType, setDialogType] = useState<"work" | "rest">("work")
  const [reminderCount, setReminderCount] = useState(0)
  const [showSettings, setShowSettings] = useState(true)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const reminderIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 加载设置
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("health-clock-settings")
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings)
        // 确保所有必要的字段都存在，如果不存在则使用默认值
        setSettings({
          workDuration: parsedSettings.workDuration || 25,
          workUnit: parsedSettings.workUnit || "minutes",
          restDuration: parsedSettings.restDuration || 5,
          restUnit: parsedSettings.restUnit || "minutes",
          workReminders: parsedSettings.workReminders || 3,
          restReminders: parsedSettings.restReminders || 3,
        })
      }
    } catch (error) {
      console.warn("Failed to load settings from localStorage:", error)
      // 如果加载失败，使用默认设置
    }
  }, [])

  // 保存设置
  useEffect(() => {
    try {
      localStorage.setItem("health-clock-settings", JSON.stringify(settings))
    } catch (error) {
      console.warn("Failed to save settings to localStorage:", error)
    }
  }, [settings])

  // 创建音频对象
  useEffect(() => {
    let audioContext: AudioContext | null = null

    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.warn("AudioContext not supported, using fallback audio")
    }

    // 工作结束提示音 - 使用上传的音频文件，备用合成音效
    const playWorkEndAudio = async () => {
      try {
        // 首先尝试加载自定义音频文件
        const audio = new Audio("/sounds/rest.mp3")
        audio.crossOrigin = "anonymous"

        // 添加加载检查
        await new Promise((resolve, reject) => {
          audio.addEventListener("canplaythrough", resolve)
          audio.addEventListener("error", reject)
          audio.load()
        })

        currentAudioRef.current = audio
        await audio.play()
      } catch (error) {
        console.warn("Failed to play work end audio file, using fallback:", error)
        // 使用备用合成音效
        if (audioContext) {
          try {
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            // 使用特定的频率来模拟休息提示音
            oscillator.frequency.value = 523.25 // C5音符，温和的提示音
            oscillator.type = "sine"

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1.2)

            oscillator.start(audioContext.currentTime)
            oscillator.stop(audioContext.currentTime + 1.2)
          } catch (synthError) {
            console.error("Failed to play fallback audio:", synthError)
          }
        }
      }
    }

    // 休息结束提示音 - 使用上传的音频文件，备用合成音效
    const playRestEndAudio = async () => {
      try {
        // 首先尝试加载自定义音频文件
        const audio = new Audio("/sounds/work.mp3")
        audio.crossOrigin = "anonymous"

        // 添加加载检查
        await new Promise((resolve, reject) => {
          audio.addEventListener("canplaythrough", resolve)
          audio.addEventListener("error", reject)
          audio.load()
        })

        currentAudioRef.current = audio
        await audio.play()
      } catch (error) {
        console.warn("Failed to play rest end audio file, using fallback:", error)
        // 使用备用合成音效
        if (audioContext) {
          try {
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            // 使用特定的频率来模拟工作提示音
            oscillator.frequency.value = 880 // A5音符，有活力的提示音
            oscillator.type = "triangle"

            gainNode.gain.setValueAtTime(0.4, audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.8)

            oscillator.start(audioContext.currentTime)
            oscillator.stop(audioContext.currentTime + 0.8)
          } catch (synthError) {
            console.error("Failed to play fallback audio:", synthError)
          }
        }
      }
    }

    audioRef.current = {
      playWorkEnd: playWorkEndAudio,
      playRestEnd: playRestEndAudio,
    } as any
  }, [])

  const convertToSeconds = (duration: number, unit: TimeUnit): number => {
    switch (unit) {
      case "hours":
        return duration * 3600
      case "minutes":
        return duration * 60
      case "seconds":
        return duration
      default:
        return duration
    }
  }

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const startTimer = () => {
    if (timerState === "idle") {
      const workSeconds = convertToSeconds(settings.workDuration, settings.workUnit)
      setTimeLeft(workSeconds)
      setTimerState("working")
      setShowSettings(false)
    }
    setIsRunning(true)
  }

  const pauseTimer = () => {
    setIsRunning(false)
  }

  const resetTimer = () => {
    setIsRunning(false)
    setTimerState("idle")
    setTimeLeft(0)
    setShowDialog(false)
    setReminderCount(0)
    setShowSettings(true)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current)
    stopAllAudio()
  }

  const stopAllAudio = () => {
    try {
      // 停止当前正在播放的音频
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current.currentTime = 0
        currentAudioRef.current = null
      }

      // 停止页面上所有的音频元素
      const allAudios = document.querySelectorAll("audio")
      allAudios.forEach((audio) => {
        audio.pause()
        audio.currentTime = 0
      })

      // 停止Web Audio API的音频上下文
      if (window.AudioContext || (window as any).webkitAudioContext) {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
          if (audioContext.state !== "closed") {
            audioContext.close()
          }
        } catch (error) {
          console.warn("Failed to close audio context:", error)
        }
      }
    } catch (error) {
      console.warn("Failed to stop audio:", error)
    }
  }

  const playReminder = () => {
    if (audioRef.current) {
      if (timerState === "working") {
        // 工作时间结束，播放温和的提示音
        return audioRef.current.playWorkEnd()
      } else {
        // 休息时间结束，播放有活力的提示音
        return audioRef.current.playRestEnd()
      }
    }
    return Promise.resolve()
  }

  const handleDialogAction = () => {
    setShowDialog(false)
    setReminderCount(0)

    // 停止重复提醒
    if (reminderIntervalRef.current) {
      clearInterval(reminderIntervalRef.current)
      reminderIntervalRef.current = null
    }

    // 停止当前播放的音频
    stopAllAudio()

    if (dialogType === "work") {
      // 开始休息
      const restSeconds = convertToSeconds(settings.restDuration, settings.restUnit)
      setTimeLeft(restSeconds)
      setTimerState("resting")
    } else {
      // 开始工作
      const workSeconds = convertToSeconds(settings.workDuration, settings.workUnit)
      setTimeLeft(workSeconds)
      setTimerState("working")
    }

    // 自动开始计时
    setIsRunning(true)
  }

  const handleDialogClose = () => {
    setShowDialog(false)
    setReminderCount(0)
    setIsRunning(false) // 暂停计时

    // 停止重复提醒
    if (reminderIntervalRef.current) {
      clearInterval(reminderIntervalRef.current)
      reminderIntervalRef.current = null
    }

    // 停止当前播放的音频
    stopAllAudio()
  }

  // 主计时器
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, timeLeft])

  // 时间到达处理
  useEffect(() => {
    if (timeLeft === 0 && timerState !== "idle") {
      setIsRunning(false)
      setDialogType(timerState === "working" ? "work" : "rest")
      setShowDialog(true)
      setReminderCount(0)

      // 开始重复提醒
      const maxReminders = timerState === "working" ? settings.workReminders : settings.restReminders

      // 播放第一次提醒
      playReminder().catch(console.error)

      // 设置重复提醒，等待音频播放完毕
      let currentCount = 0
      const playNextReminder = async () => {
        try {
          if (currentCount < maxReminders - 1 && showDialog) {
            currentCount++
            setReminderCount(currentCount)

            // 等待15秒后播放下一次提醒
            await new Promise((resolve) => setTimeout(resolve, 15000))

            // 检查弹窗是否仍然显示，如果不显示则停止提醒
            if (showDialog) {
              await playReminder()

              // 继续下一次提醒
              if (currentCount < maxReminders - 1) {
                reminderIntervalRef.current = setTimeout(playNextReminder, 0)
              }
            }
          }
        } catch (error) {
          console.error("Error in playNextReminder:", error)
        }
      }

      // 开始重复提醒循环
      if (maxReminders > 1) {
        reminderIntervalRef.current = setTimeout(playNextReminder, 15000)
      }
    }
  }, [timeLeft, timerState, settings])

  // 监听弹窗状态变化，当弹窗关闭时停止音频
  useEffect(() => {
    if (!showDialog) {
      // 弹窗关闭时停止所有音频和提醒
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current)
        reminderIntervalRef.current = null
      }
      stopAllAudio()
    }
  }, [showDialog])

  const getProgressPercentage = () => {
    if (timerState === "idle") return 0
    const totalTime =
      timerState === "working"
        ? convertToSeconds(settings.workDuration, settings.workUnit)
        : convertToSeconds(settings.restDuration, settings.restUnit)
    return ((totalTime - timeLeft) / totalTime) * 100
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* 标题 */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            健康时钟
          </h1>
          <p className="text-gray-600 mt-2">工作与休息的完美平衡</p>
        </div>

        {/* 计时器显示 */}
        <Card className="backdrop-blur-lg bg-white/80 border-0 shadow-xl rounded-3xl overflow-hidden">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              {/* 圆形进度条 */}
              <div className="relative w-48 h-48 mx-auto">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="text-gray-200"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 45}`}
                    strokeDashoffset={`${2 * Math.PI * 45 * (1 - getProgressPercentage() / 100)}`}
                    className={`transition-all duration-1000 ${
                      timerState === "working" ? "text-blue-500" : "text-green-500"
                    }`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-mono font-bold text-gray-800">{formatTime(timeLeft)}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {timerState === "working" ? "工作中" : timerState === "resting" ? "休息中" : "准备开始"}
                  </div>
                </div>
              </div>

              {/* 控制按钮 */}
              <div className="flex justify-center space-x-4">
                {!isRunning ? (
                  <Button
                    onClick={startTimer}
                    size="lg"
                    className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-2xl px-8 py-3 shadow-lg"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    {timerState === "idle" ? "立即执行" : "继续"}
                  </Button>
                ) : (
                  <Button onClick={pauseTimer} size="lg" variant="outline" className="rounded-2xl px-8 py-3 border-2">
                    <Pause className="w-5 h-5 mr-2" />
                    暂停
                  </Button>
                )}

                <Button onClick={resetTimer} size="lg" variant="outline" className="rounded-2xl px-8 py-3 border-2">
                  <RotateCcw className="w-5 h-5 mr-2" />
                  重置
                </Button>
              </div>

              {/* 设置按钮 */}
              <Button onClick={() => setShowSettings(!showSettings)} variant="ghost" className="rounded-2xl">
                <Settings className="w-4 h-4 mr-2" />
                {showSettings ? "隐藏设置" : "显示设置"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 设置面板 */}
        {showSettings && (
          <Card className="backdrop-blur-lg bg-white/80 border-0 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-center text-xl">时间设置</CardTitle>
              <p className="text-sm text-gray-500 text-center mt-1">设置将自动保存</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 工作时长 */}
              <div className="space-y-3">
                <Label className="text-base font-medium">工作时长</Label>
                <div className="flex space-x-3">
                  <Input
                    type="number"
                    value={settings.workDuration}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, workDuration: Number.parseInt(e.target.value) || 0 }))
                    }
                    className="rounded-xl"
                    min="1"
                  />
                  <Select
                    value={settings.workUnit}
                    onValueChange={(value: TimeUnit) => setSettings((prev) => ({ ...prev, workUnit: value }))}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">小时</SelectItem>
                      <SelectItem value="minutes">分钟</SelectItem>
                      <SelectItem value="seconds">秒</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 休息时长 */}
              <div className="space-y-3">
                <Label className="text-base font-medium">休息时长</Label>
                <div className="flex space-x-3">
                  <Input
                    type="number"
                    value={settings.restDuration}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, restDuration: Number.parseInt(e.target.value) || 0 }))
                    }
                    className="rounded-xl"
                    min="1"
                  />
                  <Select
                    value={settings.restUnit}
                    onValueChange={(value: TimeUnit) => setSettings((prev) => ({ ...prev, restUnit: value }))}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">小时</SelectItem>
                      <SelectItem value="minutes">分钟</SelectItem>
                      <SelectItem value="seconds">秒</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 不休息重复提醒 */}
              <div className="space-y-3">
                <Label className="text-base font-medium">不休息重复提醒次数</Label>
                <div className="flex items-center space-x-4">
                  <Slider
                    value={[settings.workReminders]}
                    onValueChange={(value) => setSettings((prev) => ({ ...prev, workReminders: value[0] }))}
                    max={100}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={settings.workReminders}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        workReminders: Math.max(1, Math.min(100, Number.parseInt(e.target.value) || 1)),
                      }))
                    }
                    className="w-20 rounded-xl"
                    min="1"
                    max="100"
                  />
                </div>
              </div>

              {/* 不工作重复提醒 */}
              <div className="space-y-3">
                <Label className="text-base font-medium">不工作重复提醒次数</Label>
                <div className="flex items-center space-x-4">
                  <Slider
                    value={[settings.restReminders]}
                    onValueChange={(value) => setSettings((prev) => ({ ...prev, restReminders: value[0] }))}
                    max={100}
                    min={1}
                    step={1}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={settings.restReminders}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        restReminders: Math.max(1, Math.min(100, Number.parseInt(e.target.value) || 1)),
                      }))
                    }
                    className="w-20 rounded-xl"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 提醒弹窗 */}
        <Dialog
          open={showDialog}
          onOpenChange={(open) => {
            if (!open) {
              handleDialogClose()
            }
          }}
        >
          <DialogContent className="rounded-3xl border-0 shadow-2xl max-w-sm mx-auto">
            <DialogHeader>
              <DialogTitle className="text-center text-2xl">
                {dialogType === "work" ? "休息，休息一下" : "继续干！"}
              </DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-6 py-4">
              <div className="text-6xl">{dialogType === "work" ? "😴" : "💪"}</div>
              <p className="text-gray-600">
                {dialogType === "work" ? "工作时间结束，该休息一下了" : "休息时间结束，继续加油工作吧！"}
              </p>
              <Button
                onClick={handleDialogAction}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-2xl px-8 py-3 shadow-lg"
              >
                {dialogType === "work" ? "休息" : "干！"}
              </Button>
              {reminderCount > 0 && <p className="text-sm text-gray-500">提醒次数: {reminderCount + 1}</p>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
