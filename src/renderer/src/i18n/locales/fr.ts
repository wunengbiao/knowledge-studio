import type zh from './zh'

const fr: Record<keyof typeof zh, string> = {
  // Common
  'common.save': 'Enregistrer',
  'common.saved': 'Enregistré',
  'common.cancel': 'Annuler',
  'common.delete': 'Supprimer',
  'common.remove': 'Retirer',
  'common.edit': 'Modifier',
  'common.test': 'Tester',
  'common.add': 'Ajouter',
  'common.create': 'Créer',
  'common.retry': 'Réessayer',
  'common.search': 'Rechercher',
  'common.back': 'Retour',
  'common.close': 'Fermer',
  'common.prev': 'Précédent',
  'common.next': 'Suivant',
  'common.loading': 'Chargement...',
  'common.optional': '(facultatif)',
  'common.notSpecified': 'Non spécifié',
  'common.builtin': 'Intégré',
  'common.custom': 'Personnalisé',
  'common.inUse': 'En cours d’utilisation',
  'common.import': 'Importer',
  'common.preview': 'Aperçu',
  'common.source': 'Source',
  'common.copy': 'Copier',
  'common.zoomIn': 'Agrandir',
  'common.zoomOut': 'Réduire',
  'common.reset': 'Réinitialiser (100%)',
  'common.noResults': 'Aucun résultat',

  // Sidebar
  'sidebar.title': 'Knowledge Studio',
  'sidebar.hideSidebar': 'Masquer la barre latérale',
  'sidebar.showSidebar': 'Afficher la barre latérale',
  'sidebar.kbManagement': 'Gestion des bases de connaissances',
  'sidebar.conversations': 'Conversations',
  'sidebar.newConversation': 'Nouvelle conversation',
  'sidebar.noConversations': 'Aucune conversation',
  'sidebar.knowledgeBases': 'Bases de connaissances',
  'sidebar.noKnowledgeBases': 'Aucune base de connaissances',
  'sidebar.settings': 'Paramètres',
  'sidebar.messageCount': '{n} messages',
  'sidebar.documentCount': '{n} documents',
  'sidebar.archive': 'Archiver',
  'sidebar.archived': 'Archivées',
  'sidebar.unarchive': 'Désarchiver',
  'sidebar.moreActions': "Plus d'actions",
  'sidebar.resize': 'Glisser pour redimensionner',
  'archive.title': 'Conversations archivées',
  'archive.empty': 'Aucune conversation archivée',
  'archive.restoreHint':
    'Cliquez sur le bouton restaurer pour renvoyer une conversation vers la barre latérale',

  // AppLayout
  'appLayout.newConversationDefault': 'Nouvelle conversation',
  'appLayout.clickToEditTitle': 'Cliquez pour modifier le titre',

  // Categories
  'category.general': 'Général',
  'category.technical': 'Technique',
  'category.research': 'Recherche',
  'category.legal': 'Juridique',
  'category.medical': 'Médical',
  'category.custom': 'Personnalisé',
  'category.desc.general': 'Pour les connaissances générales du quotidien',
  'category.desc.technical': 'Documentation technique et ressources de développement',
  'category.desc.research': 'Articles de recherche et matériel académique',
  'category.desc.legal': 'Dispositions légales et contrats',
  'category.desc.medical': 'Littérature médicale et ressources cliniques',
  'category.desc.custom': 'Catégorie personnalisée',

  // Home page
  'home.heroTitle': 'Knowledge Studio',
  'home.heroDesc':
    'Un outil de gestion des connaissances local d’abord, prenant en charge la recherche hybride BM25 + vectorisation + re-ranking, combinée à la technologie GraphRAG pour une recherche améliorée par graphe de connaissances.',
  'home.createKb': 'Nouvelle base de connaissances',
  'home.createKbDesc': 'Créer un nouvel espace de connaissances',
  'home.configureModels': 'Configurer les modèles',
  'home.configureModelsDesc': "Configurer l'API d'Embedding",
  'home.kbCount': '{n} bases de connaissances',
  'home.docCount': '{n} documents',
  'home.myKnowledgeBases': 'Mes bases de connaissances',
  'home.noKbYet': "Aucune base de connaissances pour l'instant, créez la première",
  'home.documentCountShort': '{n} documents',

  // Chat page
  'chat.startDirectChat': 'Démarrer une conversation directe',
  'chat.noKbSelected': 'Aucune base de connaissances sélectionnée, le modèle répondra directement',
  'chat.typeAtForKb': 'Tapez @ pour sélectionner une base de connaissances pour la recherche',
  'chat.startKbChat': 'Démarrer une conversation avec votre base de connaissances',
  'chat.selectedKbsCount':
    '{n} bases de connaissances sélectionnées, les questions seront basées sur les résultats de recherche',
  'chat.thinking': 'Réflexion...',
  'chat.searchingAndThinking': 'Recherche et réflexion...',
  'chat.thinkingShort': 'Réflexion...',
  'chat.noKbs': 'Aucune base de connaissances',
  'chat.noMatchingKbs': 'Aucune base de connaissances correspondante',
  'chat.documentCount': '{n} documents',
  'chat.placeholderNoKb':
    'Saisissez un message... Tapez @ pour sélectionner une base de connaissances (Entrée pour envoyer, Shift+Entrée pour un saut de ligne)',
  'chat.placeholderWithKb':
    'Saisissez un message... (Entrée pour envoyer, Shift+Entrée pour un saut de ligne)',
  'chat.editHint':
    'Entrée pour enregistrer · Shift+Entrée pour un saut de ligne · Échap pour annuler',
  'chat.closeCitation': 'Fermer les détails de la citation',
  'chat.relevance': 'Pertinence {n}%',
  'chat.you': 'Vous',
  'chat.citationSource': 'Sources · {n}',
  'chat.citationN': 'Citation {n} : {title}',
  'chat.send': 'Envoyer',
  'chat.stop': 'Arrêter',
  'chat.attachImage': 'Joindre une image',
  'chat.webSearch': 'Recherche web',
  'chat.imageNotSupported':
    "Le modèle actuel ne prend pas en charge la saisie d'images. Les images ne seront pas envoyées au modèle.",

  // Knowledge base page
  'kbPage.notFound': 'Base de connaissances introuvable',
  'kbPage.edit': 'Modifier',
  'kbPage.search': 'Rechercher',
  'kbPage.knowledgeGraph': 'Graphe de connaissances',
  'kbPage.uploadFiles': 'Importer des fichiers',
  'kbPage.importWeb': 'Importer une page web',
  'kbPage.building': 'Construction...',
  'kbPage.rebuildGraph': 'Reconstruire le graphe',
  'kbPage.buildGraph': 'Construire le graphe',
  'kbPage.enterUrl': "Saisissez l'URL de la page web...",
  'kbPage.documentList': 'Documents ({n})',
  'kbPage.uploadToStart':
    'Importez des documents ou des pages web pour commencer à construire la base de connaissances',
  'kbPage.chunkCount': '{n} segments',
  'kbPage.statusPending': 'En attente',
  'kbPage.statusProcessing': 'Traitement en cours',
  'kbPage.statusDone': 'Vectorisé',
  'kbPage.statusFailed': 'Échec',
  'kbPage.editKb': 'Modifier la base de connaissances',
  'kbPage.name': 'Nom',
  'kbPage.enterKbName': 'Saisissez le nom de la base de connaissances',
  'kbPage.description': 'Description',
  'kbPage.shortDescOptional': 'Description courte (facultatif)',
  'kbPage.category': 'Catégorie',
  'kbPage.chunking': 'Segmentation des documents',
  'kbPage.chunkingNote':
    "Les modifications n'affectent que les nouveaux documents ajoutés ; les documents existants conservent leurs segments d'origine.",
  'kbPage.chunkSize': 'Taille des segments (caractères)',
  'kbPage.chunkOverlap': 'Chevauchement (phrases)',
  'kbPage.embeddingModel': "Modèle d'Embedding",
  'kbPage.notEditable': 'Non modifiable',
  'kbPage.embeddingLocked':
    "La configuration d'Embedding est fixée à la création ; la modifier invaliderait les vecteurs existants.",
  'kbPage.rerankModel': 'Modèle de ReRank',
  'kbPage.optionalRerank': 'Facultatif',
  'kbPage.rerankDesc':
    "Re-classe les résultats de recherche ; si non sélectionné, l'étape de ReRank est ignorée.",
  'kbPage.notSpecifiedNoRerank': 'Non spécifié (pas de ReRank)',
  'kbPage.noRerankCapability': "Aucun fournisseur n'a encore activé la capacité ReRank.",
  'kbPage.saveFailed': "Échec de l'enregistrement",
  'kbPage.icon': 'Icône',
  'kbPage.iconAuto': 'Suivre la catégorie',
  'kbPage.docNamePlaceholder': 'Saisissez le nom du document...',
  'kbPage.renameFailed': 'Échec du renommage',
  'kbPage.viewChunks': 'Voir les détails des segments',
  'kbPage.chunkDetail': 'Détails des segments',
  'kbPage.chunkNoTitle': 'Sans titre',
  'kbPage.chunkExpand': 'Développer',
  'kbPage.chunkCollapse': 'Réduire',
  'kbPage.noChunks': 'Aucun segment dans ce document',
  'kbPage.delete': 'Supprimer',
  'kbPage.deleteConfirmTitle': 'Supprimer cette base de connaissances ?',
  'kbPage.deleteConfirmDesc':
    'Cela supprimera définitivement la base de connaissances et tous ses documents. Cette action est irréversible.',
  'kbPage.deleteFailed': 'Échec de la suppression',

  // Search page
  'searchPage.modeHybrid': 'Hybride',
  'searchPage.modeBm25': 'BM25',
  'searchPage.modeVector': 'Vectoriel',
  'searchPage.modeGraph': 'Graphe',
  'searchPage.descHybrid': 'BM25 + Vectoriel',
  'searchPage.descBm25': 'Correspondance de mots-clés',
  'searchPage.descVector': 'Recherche sémantique',
  'searchPage.descGraph': 'GraphRAG',
  'searchPage.title': 'Recherche · {name}',
  'searchPage.placeholder': 'Saisissez le contenu à rechercher...',
  'searchPage.sourceBm25': 'BM25',
  'searchPage.sourceVector': 'Vectoriel',
  'searchPage.sourceHybrid': 'Hybride',
  'searchPage.sourceGraph': 'Graphe',
  'searchPage.noResults': 'Aucun résultat trouvé',
  'searchPage.tryDifferent': "Essayez d'autres mots-clés ou un autre mode de recherche",
  'searchPage.enterToSearch': 'Saisissez des mots-clés pour commencer la recherche',
  'searchPage.supportModes': 'Prend en charge les modes BM25, Vectoriel, Hybride et Graphe',
  'searchPage.relevance': 'Pertinence : {n}%',

  // Graph page
  'graphPage.notFound': 'Base de connaissances introuvable',
  'graphPage.title': 'Graphe de connaissances · {name}',
  'graphPage.viewGraph': 'Graphe',
  'graphPage.viewCommunities': 'Communautés',
  'graphPage.notBuilt': 'Graphe de connaissances non encore construit',
  'graphPage.notBuiltDesc':
    'Le graphe de connaissances extrait les entités et les relations des documents, découvre les connexions par détection de communautés, et permet une recherche sémantique plus approfondie.',
  'graphPage.building': 'Construction...',
  'graphPage.buildGraph': 'Construire le graphe de connaissances',
  'graphPage.entities': 'Entités',
  'graphPage.relations': 'Relations',
  'graphPage.communities': 'Communautés',
  'graphPage.entityList': 'Liste des entités',
  'graphPage.notEnoughForCommunities': "Pas assez d'entités pour former des communautés",
  'graphPage.more': '+{n} de plus',

  // Create KB modal
  'createKb.title': 'Nouvelle base de connaissances',
  'createKb.name': 'Nom',
  'createKb.enterKbName': 'Saisissez le nom de la base de connaissances',
  'createKb.description': 'Description',
  'createKb.shortDesc': 'Description courte',
  'createKb.category': 'Catégorie',
  'createKb.chunking': 'Segmentation des documents',
  'createKb.chunkSize': 'Taille des segments (caractères)',
  'createKb.chunkOverlap': 'Chevauchement (phrases)',
  'createKb.embeddingModel': "Modèle d'Embedding",
  'createKb.lockedAfterCreate': 'Verrouillé après la création',
  'createKb.embeddingDesc':
    "Sélectionnez un modèle avec la capacité d'Embedding ; cette configuration est verrouillée après la création.",
  'createKb.notSelected': 'Non sélectionné',
  'createKb.noEmbeddingCapability': "Aucun fournisseur n'a encore activé la capacité d'Embedding.",
  'createKb.embeddingProviderNotFound': "Fournisseur d'Embedding introuvable",
  'createKb.createFailed': 'Échec de la création',
  'createKb.icon': 'Icône',
  'createKb.iconDesc': 'Facultatif ; suit la catégorie de la base de connaissances si non défini',

  // Settings page
  'settings.title': 'Paramètres',
  'settings.nav.groupGeneral': 'Général',
  'settings.nav.groupModels': 'Modèles',
  'settings.nav.groupServices': 'Services',
  'settings.nav.groupApp': 'Application',
  'settings.nav.profile': 'Profil',
  'settings.nav.providers': 'Fournisseurs de modèles',
  'settings.nav.defaultModels': 'Modèles par défaut',
  'settings.nav.assistants': 'Assistants',
  'settings.nav.ocr': 'PDF OCR',
  'settings.nav.display': 'Affichage',
  'settings.nav.language': 'Langue',
  'settings.nav.proxy': 'Proxy réseau',
  'settings.nav.search': 'Recherche',
  'settings.searchDesc':
    'Configurez le nombre de résultats de recherche de la base de connaissances.',
  'settings.searchTopK': 'Nombre de résultats de recherche',
  'settings.searchTopKDesc': 'Nombre final de résultats renvoyés pour tous les modes de recherche.',
  'settings.embeddingTopK': 'Nombre de recherche vectorielle',
  'settings.embeddingTopKDesc':
    'Nombre de candidats pour la recherche vectorielle, utilisé comme pool de candidats dans la recherche hybride.',
  'settings.searchHint':
    'Le nombre de recherche vectorielle doit être supérieur ou égal au nombre de résultats de recherche pour un meilleur rappel dans la recherche hybride.',
  'settings.delete': 'Supprimer',
  'settings.test': 'Tester',
  'settings.modelIdPlaceholder': 'ID du modèle, ex. deepseek-chat',
  'settings.apiHost': 'API Host',
  'settings.apiHostDesc':
    'URL de base ; les chemins Chat / Embedding / ReRank sont ajoutés automatiquement.',
  'settings.apiKey': 'API Key',
  'settings.modelList': 'Liste des modèles',
  'settings.modelListDesc':
    "Chaque modèle peut remplir plusieurs capacités ; ne cochez que celles qu'il prend réellement en charge.",
  'settings.fetchFromService': 'Récupérer depuis le service',
  'settings.addModel': 'Ajouter un modèle',
  'settings.noModels': 'Aucun modèle. Cliquez sur « Ajouter un modèle » en haut à droite.',
  'settings.fetchTitle': 'Récupérer la liste des modèles depuis {name}',
  'settings.fetchingModels': 'Récupération de la liste des modèles...',
  'settings.noNewModels': 'Aucun nouveau modèle à ajouter (peut-être déjà tous ajoutés).',
  'settings.searchModelsPlaceholder': 'Rechercher par ID de modèle, nom ou owned_by',
  'settings.filterAll': 'Tous',
  'settings.modelCount': '{n} nouveaux modèles au total',
  'settings.modelCountShown': '{n} affichés',
  'settings.selectAll': 'Tout sélectionner',
  'settings.selectNone': 'Tout désélectionner',
  'settings.noMatchingModels':
    'Aucun modèle ne correspond à la recherche ou au filtre de capacité actuel.',
  'settings.addSelected': 'Ajouter la sélection',
  'settings.defaultModels': 'Modèles par défaut',
  'settings.defaultModelsDesc':
    'Spécifiez un modèle par défaut pour chaque capacité ; les nouvelles sessions et les flux de recherche sans modèle explicite utiliseront ceux-ci.',
  'settings.capabilityChatDesc':
    'Chat et Q&R ; affecte le modèle initial des nouvelles conversations.',
  'settings.capabilityEmbeddingDesc':
    'Vectorisation des documents ; affecte le modèle initial des nouvelles bases de connaissances.',
  'settings.capabilityRerankDesc':
    'Re-classement des résultats de recherche ; affecte le modèle initial quand ReRank est activé.',
  'settings.noCapability': "Aucun fournisseur n'a encore activé la capacité {cap}.",
  'settings.assistantSettings': 'Assistants',
  'settings.assistantDesc':
    'Gérez les prompts des assistants, les paramètres de modèle dédiés et les bases de connaissances par défaut. La page Chat ne conserve que le sélecteur déroulant en haut.',
  'settings.createAssistant': 'Nouvel assistant',
  'settings.noAssistants': "Aucun assistant pour l'instant",
  'settings.createAssistantHint': 'Créez un assistant pour basculer entre eux en haut de Chat.',
  'settings.globalDefaultModel': 'Modèle par défaut global',
  'settings.kbCount': '{n} bases de connaissances',
  'settings.noDescription': 'Aucune description',
  'settings.noPrompt': 'Aucun prompt système défini',
  'settings.apiKeyMistral': 'API Key',
  'settings.mistralPlaceholder':
    "Laissez vide pour utiliser l'extraction en texte brut locale pdf-parse",
  'settings.mistralKeyHint': 'Obtenez votre clé API depuis la console Mistral',
  'settings.apiUrl': "URL de l'API",
  'settings.model': 'Modèle',
  'settings.testConnection': 'Tester la connexion',
  'settings.enableProxy': 'Activer le proxy',
  'settings.proxyDesc': 'Accéder aux API externes via un proxy HTTP.',
  'settings.proxyAddress': 'Adresse du proxy',
  'settings.proxyAddressDesc': 'Prend en charge les proxy HTTP, ex. http://127.0.0.1:7890',
  'settings.proxyHint': 'Activez pour configurer un proxy HTTP.',
  'settings.codeBlockWordWrap': 'Retour à la ligne des blocs de code',
  'settings.codeBlockWordWrapDesc':
    'Activé, les blocs de code dans les messages de chat passent à la ligne ; désactivé, ils défilent horizontalement.',
  'settings.codeBlockShowLineNumbers': 'Afficher les numéros de ligne dans les blocs de code',
  'settings.codeBlockShowLineNumbersDesc':
    "Activé, les numéros de ligne s'affichent à gauche des blocs de code ; désactivé, seul le code s'affiche.",
  'settings.codeTheme': 'Thème de code',
  'settings.codeThemeDesc':
    'Choisissez le thème de couleur des blocs de code ; l’aperçu ci-dessous se met à jour en direct.',
  'settings.codeFont': 'Police de code',
  'settings.codeFontDesc':
    'Choisissez la police à chasse fixe des blocs de code ; l’aperçu ci-dessous se met à jour en direct.',
  'settings.codeFontSize': 'Taille de police du code',
  'settings.codeFontSizeDesc':
    'Ajustez la taille de police des blocs de code ; l’aperçu ci-dessous se met à jour en direct.',
  'settings.avatar': 'Avatar',
  'settings.avatarDesc': 'JPG / PNG / WebP, sera automatiquement compressé à 128×128.',
  'settings.changeAvatar': "Changer d'avatar",
  'settings.uploadAvatar': 'Télécharger un avatar',
  'settings.saveHint':
    'Cliquez sur « Enregistrer » en haut à droite pour appliquer les modifications.',
  'settings.addCustomProvider': 'Ajouter un fournisseur personnalisé',
  'settings.uiTitle': "Paramètres d'affichage",
  'settings.paneDesc.general':
    'Personnalisez votre avatar ; il apparaît à côté de vos messages dans les conversations.',
  'settings.paneDesc.providers':
    "Configurez l'API Host et la Key de chaque fournisseur, puis cochez les capacités prises en charge par chaque modèle dans la liste unifiée.",
  'settings.paneDesc.models':
    'Spécifiez les modèles par défaut globaux pour Chat / Embedding / ReRank ; toutes les nouvelles conversations et flux de recherche utiliseront ces valeurs par défaut.',
  'settings.paneDesc.assistants':
    'Configurez les prompts des assistants, les paramètres de modèle et les bases de connaissances par défaut ; basculez entre eux sur la page Chat.',
  'settings.paneDesc.ocr':
    "Une fois configuré, les PDF sont convertis en Markdown via Mistral OCR ; sinon, l'extraction en texte brut est utilisée.",
  'settings.paneDesc.ui':
    "Configurez l'apparence du thème et l'affichage des blocs de code dans les messages de chat.",
  'settings.testFailed': 'Échec du test',
  'settings.fetchFailed': 'Échec de la récupération',
  'settings.imageLoadFailed': 'Échec du chargement de l’image',

  // Theme settings
  'settings.themeSection': 'Thème',
  'settings.themeDesc':
    'Choisissez un thème clair ou sombre. Les changements s’appliquent immédiatement.',
  'settings.themeLight': 'Clair',
  'settings.themeDark': 'Sombre',

  // Language settings
  'settings.languageSection': 'Langue',
  'settings.languageDesc':
    "Choisissez la langue de l'interface ; les changements s'appliquent immédiatement.",
  'settings.langZh': '中文',
  'settings.langEn': 'English',
  'settings.langJa': '日本語',
  'settings.langKo': '한국어',
  'settings.langFr': 'Français',
  'settings.langDe': 'Deutsch',
  'settings.langRu': 'Русский',

  // Message actions
  'messageActions.copy': 'Copier',
  'messageActions.copied': 'Copié',
  'messageActions.regenerate': 'Régénérer',
  'messageActions.edit': 'Modifier',
  'messageActions.delete': 'Supprimer',

  // Assistant
  'assistant.label': 'Assistant',
  'assistant.newAssistant': 'Nouvel assistant',
  'assistant.default': 'Assistant par défaut',
  'assistant.create': 'Nouveau',
  'assistant.nameRequired': "Le nom de l'assistant est obligatoire",
  'assistant.configHint':
    'Configurez les prompts, les paramètres de modèle et les bases de connaissances par défaut.',
  'assistant.basicInfo': 'Informations de base',
  'assistant.namePlaceholder': 'Donnez un nom à l’assistant',
  'assistant.promptPlaceholder': 'ex. lecture d’articles, Q&R sur du code',
  'assistant.systemPrompt': 'Prompt système',
  'assistant.markdownHint': 'Prend en charge Markdown ; vérifiez la mise en forme dans l’aperçu.',
  'assistant.noPrompt': 'Aucun contenu de prompt',
  'assistant.modelAndParams': 'Modèles et paramètres',
  'assistant.useGlobalDefaultChatModel': 'Utiliser le modèle de chat par défaut global',
  'assistant.rerankModel': 'Modèle de ReRank',
  'assistant.useDefaultRerankModel': 'Utiliser le modèle de ReRank par défaut',
  'assistant.noRerankCapability': "Aucun fournisseur n'a encore activé la capacité ReRank.",
  'assistant.contextCount': 'Nombre de contextes',
  'assistant.contextCountHint':
    'Nombre de messages passés envoyés au modèle à chaque tour. 0 signifie aucun historique.',
  'assistant.defaultKb': 'Bases de connaissances par défaut',
  'assistant.defaultKbHint':
    "Quand aucune base de connaissances n'est sélectionnée manuellement avec @, ces bases sont utilisées lors de l'envoi des messages.",
  'assistant.selected': '{n} sélectionné(s)',
  'assistant.customParams': 'Paramètres personnalisés',
  'assistant.customParamsPlaceholder':
    'Champs supplémentaires injectés dans le corps de la requête (ex. stream, effort, reasoning_effort). Les paramètres de même nom remplacent ceux définis ci-dessus.',
  'assistant.noCustomParams': 'Aucun paramètre personnalisé',
  'assistant.jsonParseFailed': "Échec de l'analyse JSON",
  'assistant.paramNamePlaceholder': 'Nom du paramètre, ex. stream',
  'assistant.deleteParam': 'Supprimer le paramètre',
  'assistant.paramValuePlaceholder': 'ex. {"key":"value"} ou [1,2,3]',
  'assistant.jsonError': 'Erreur JSON :',
  'assistant.stringValue': 'Valeur chaîne',

  // Thinking block
  'thinking.expand': 'Développer la réflexion',
  'thinking.collapse': 'Réduire la réflexion',
  'thinking.thinking': 'Réflexion',
  'thinking.thoughtFor': 'Réfléchi pendant {n}s',
  'thinking.deepThought': 'Réflexion approfondie terminée',
  'thinking.process': 'Processus de réflexion',
  'thinking.waiting': 'En attente du contenu de réflexion du modèle...',

  // Markdown
  'markdown.copyCode': 'Copier le code',
  'markdown.codeCopied': 'Copié',
  'markdown.copy': 'Copier',

  // Mermaid
  'mermaid.renderFailed': 'Échec du rendu Mermaid',
  'mermaid.rendering': 'Rendu en cours...',
  'mermaid.generating': 'Génération...',

  // SVG
  'svg.domParserUnsupported': "DOMParser non pris en charge dans l'environnement actuel",
  'svg.parseFailed': 'Échec de l’analyse SVG',
  'svg.noSvgRoot': 'Aucun élément racine <svg> trouvé',
  'svg.renderFailed': 'Échec du rendu SVG',
  'svg.generating': 'Génération...',

  // Citation
  'citation.clickToViewFull': 'Cliquez pour voir le contenu complet',
  'citation.visitSite': 'Visiter le site',

  // Error messages (store-level)
  'error.loadConversationsFailed': 'Échec du chargement des conversations',
  'error.noConversationSelected': 'Aucune conversation sélectionnée',
  'error.sendFailed': "Échec de l'envoi",
  'error.deleteMessageFailed': 'Échec de la suppression du message',
  'error.messageEmpty': 'Le contenu du message ne peut pas être vide',
  'error.messageNotFound': 'Message introuvable',
  'error.onlyEditUserMessages': 'Seuls les messages utilisateur peuvent être modifiés',
  'error.editFailed': 'Échec de la modification',
  'error.updateFailed': 'Échec de la mise à jour',
  'error.onlyRegenerateAssistantMessages':
    "Seuls les messages de l'assistant peuvent être régénérés",
  'error.regenerateFailed': 'Échec de la régénération',
  'error.searchFailed': 'Échec de la recherche',
  'error.loadAssistantsFailed': 'Échec du chargement des assistants',
  'error.abortFailed': "Échec de l'arrêt"
}

export default fr
