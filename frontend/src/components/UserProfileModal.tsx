import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  createUnifiedAPI,
  resolveAPIResourceURL,
  runningInTauri,
  selectDesktopFilePath,
} from "../desktop";
import { httpBaseURL } from "../config";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { cli } from "./utils";
import { IconButton } from "./ui/IconButton";
import { Avatar } from "./ui/Avatar";
import type { ProfileData, ProfileImageKind } from "../protocol";

export function UserProfileModal({
  username,
  onClose,
  onStartConversation,
}: {
  username: string;
  onClose: () => void;
  onStartConversation?: (username: string) => void;
}) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const currentUser = useChatStore((state) => state.currentUser);
  const status = useChatStore((state) => state.status);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const realtimeProfile = useChatStore((state) => state.profilesByUsername[username]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState(0);
  const [uploadingImage, setUploadingImage] = useState<ProfileImageKind | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);

  const isOwn = currentUser?.username === username;
  // 自己是否在线可以直接由本机实时连接判断；其他用户则优先使用实时在线列表。
  // profile 接口中的 online 作为兜底，以兼容尚未收到在线列表的短暂阶段。
  const isProfileOnline = isOwn
    ? status === "connected" || profile?.user.online === true
    : onlineUsers.some((user) => user.username === username && user.online) ||
      profile?.user.online === true;

  useEffect(() => {
    cli(() => loadProfile())();
  }, [username]);

  useEffect(() => {
    if (realtimeProfile) {
      setProfile((current) => ({
        ...realtimeProfile,
        ...(current?.email ? { email: current.email } : {}),
      }));
    }
  }, [realtimeProfile]);

  async function loadProfile() {
    if (!token) return;
    try {
      setLoading(true);
      setLoadError("");
      const api = createUnifiedAPI(httpBaseURL);
      const p = await api.getProfile(token, username);
      setProfile(p);
      useChatStore.setState((state) => ({
        profilesByUsername: {
          ...state.profilesByUsername,
          [username]: p,
        },
      }));
      setNickname(p.user.nickname);
      setBio(p.bio);
      setEmail(p.email ?? "");
      setGender(p.gender);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : t(language, "profile.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!token) return;
    try {
      setSaving(true);
      setSaveError("");
      const api = createUnifiedAPI(httpBaseURL);
      const p = await api.updateProfile(token, username, {
        nickname,
        bio,
        email: email || undefined,
        gender,
      });
      setProfile(p);
      if (isOwn) {
        useChatStore.setState((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, nickname: p.user.nickname }
            : state.currentUser,
        }));
      }
      setEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : t(language, "profile.saveError"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadProfileImage(kind: ProfileImageKind, file?: File) {
    if (!token || !isOwn) return;
    try {
      setUploadingImage(kind);
      setSaveError("");
      const api = createUnifiedAPI(httpBaseURL);
      let updated: ProfileData;
      if (runningInTauri()) {
        const filePath = await selectDesktopFilePath({ imagesOnly: true });
        if (!filePath) return;
        updated = await api.uploadProfileImageFromPath(token, username, kind, filePath);
      } else {
        if (!file) return;
        updated = await api.uploadProfileImage(token, username, kind, file);
      }
      setProfile(updated);
      useChatStore.setState((state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, ...updated.user }
          : null,
        profilesByUsername: {
          ...state.profilesByUsername,
          [username]: updated,
        },
      }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t(language, "profile.imageUploadError"));
    } finally {
      setUploadingImage(null);
    }
  }

  function chooseProfileImage(kind: ProfileImageKind) {
    if (runningInTauri()) {
      void uploadProfileImage(kind);
      return;
    }
    (kind === "avatar" ? avatarInputRef : backgroundInputRef).current?.click();
  }

  const genderLabel = (g: number) =>
    g === 1 ? t(language, "profile.genderMale") : g === 2 ? t(language, "profile.genderFemale") : g === 3 ? t(language, "profile.genderOther") : "";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t(language, "profile.label")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <div>
            <p className="section-label">{t(language, "profile.label")}</p>
            <h2>@{username}</h2>
          </div>
          <IconButton icon={X} label={t(language, "feedback.dismiss")} onClick={onClose} />
        </header>

        <div className="modal-body">
          {loading ? (
            <p className="text-muted">{t(language, "profile.loading")}</p>
          ) : loadError ? (
            <div className="callout error" role="alert">
              <span>{loadError}</span>
            </div>
          ) : profile ? (
            editing ? (
              <div className="form-block profile-form">
                <Avatar user={profile.user} size="large" online={isProfileOnline} />
                <input
                  ref={avatarInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadProfileImage("avatar", file);
                  }}
                />
                <input
                  ref={backgroundInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadProfileImage("background", file);
                  }}
                />
                <div className="profile-media-actions">
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    disabled={uploadingImage !== null}
                    onClick={() => chooseProfileImage("avatar")}
                  >
                    {uploadingImage === "avatar"
                      ? t(language, "profile.uploadingImage")
                      : t(language, "profile.changeAvatar")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    disabled={uploadingImage !== null}
                    onClick={() => chooseProfileImage("background")}
                  >
                    {uploadingImage === "background"
                      ? t(language, "profile.uploadingImage")
                      : t(language, "profile.changeBackground")}
                  </button>
                </div>
                <label>
                  {t(language, "profile.nickname")}
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={saving}
                  />
                </label>
                <label>
                  {t(language, "profile.bio")}
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    disabled={saving}
                    rows={4}
                  />
                </label>
                <label>
                  {t(language, "profile.email")}
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={saving}
                  />
                </label>
                <label>
                  {t(language, "profile.gender")}
                  <select
                    value={gender}
                    onChange={(e) => setGender(Number(e.target.value))}
                    disabled={saving}
                  >
                    <option value={0}>{t(language, "profile.genderUnspecified")}</option>
                    <option value={1}>{t(language, "profile.genderMale")}</option>
                    <option value={2}>{t(language, "profile.genderFemale")}</option>
                    <option value={3}>{t(language, "profile.genderOther")}</option>
                  </select>
                </label>
                {saveError ? (
                  <div className="callout error" role="alert">
                    <span>{saveError}</span>
                  </div>
                ) : null}
                <div className="profile-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={saving}
                    onClick={() => handleSave().catch(() => {})}
                  >
                    {saving ? t(language, "profile.saving") : t(language, "profile.save")}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={saving}
                    onClick={() => setEditing(false)}
                  >
                    {t(language, "profile.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="profile-view">
                <div className="profile-space">
                  <div
                    className="profile-cover"
                    style={profile.backgroundUrl
                      ? { backgroundImage: `url(${resolveAPIResourceURL(profile.backgroundUrl)})` }
                      : undefined}
                    aria-hidden="true"
                  />
                  <div className="profile-hero">
                    <Avatar user={profile.user} size="large" online={isProfileOnline} />
                    <div className="profile-hero-copy">
                      <div className="profile-hero-headline">
                        <strong>{profile.user.nickname}</strong>
                        <span
                          className={`scope-badge ${
                            isProfileOnline ? "scope-badge-live" : ""
                          }`}
                        >
                          {isProfileOnline
                            ? t(language, "chat.live")
                            : t(language, "chat.offline")}
                        </span>
                      </div>
                      <span>@{profile.user.username}</span>
                      <small>
                        {t(language, "profile.joined")}{" "}
                        {new Date(profile.createdAt).toLocaleDateString()}
                      </small>
                    </div>
                  </div>
                </div>
                <div className="profile-actions">
                  {isOwn ? (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="secondary-button profile-edit-trigger"
                    >
                      {t(language, "profile.edit")}
                    </button>
                  ) : onStartConversation ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => onStartConversation(username)}
                    >
                      {t(language, "profile.startConversation")}
                    </button>
                  ) : null}
                </div>
                {genderLabel(profile.gender) && (
                  <div className="profile-field">
                    <span className="text-muted">{t(language, "profile.gender")}</span>
                    <span>{genderLabel(profile.gender)}</span>
                  </div>
                )}
                <div className="profile-field profile-bio">
                  <span>{t(language, "profile.bio")}</span>
                  <p className={!profile.bio ? "text-muted" : undefined}>
                    {profile.bio || t(language, "profile.bioEmpty")}
                  </p>
                </div>
                {isOwn && profile.email && (
                  <div className="profile-field">
                    <span className="text-muted">{t(language, "profile.email")}</span>
                    <span>{profile.email}</span>
                  </div>
                )}
              </div>
            )
          ) : (
            <p className="text-muted">{t(language, "profile.notFound")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
