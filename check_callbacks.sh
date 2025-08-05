#!/bin/bash

echo "🔍 Checking for unhandled callback actions..."
echo

# Extract all callback_data values
echo "📊 Extracting all callback actions..."
CALLBACKS=$(grep -o "callback_data: '[^']*'" src/modules/telegramBot.js | sed "s/callback_data: '//" | sed "s/'$//" | sort | uniq)

echo "Found $(echo "$CALLBACKS" | wc -l) unique callback actions"
echo

# Check which callbacks are handled in the handleCallbackQuery method
echo "🔍 Checking which callbacks are handled..."
echo

UNHANDLED=""
HANDLED=""

# Get the handleCallbackQuery method content  
HANDLER_CONTENT=$(sed -n '/async handleCallbackQuery(ctx)/,/^    async [a-zA-Z]/p' src/modules/telegramBot.js)

for callback in $CALLBACKS; do
    # Check if callback is handled (looking for the exact string or pattern)
    if echo "$HANDLER_CONTENT" | grep -q "'$callback'" || \
       echo "$HANDLER_CONTENT" | grep -q "\"$callback\"" || \
       echo "$HANDLER_CONTENT" | grep -q "\`$callback\`" || \
       echo "$HANDLER_CONTENT" | grep -q "startsWith('$(echo $callback | cut -d'_' -f1)_')" || \
       echo "$HANDLER_CONTENT" | grep -q "startsWith(\"$(echo $callback | cut -d'_' -f1)_\")"
    then
        HANDLED="$HANDLED$callback\n"
        echo "  ✓ $callback"
    else
        UNHANDLED="$UNHANDLED$callback\n"
        echo "  ✗ $callback"
    fi
done

echo
echo "📋 Summary:"
HANDLED_COUNT=$(echo -e "$HANDLED" | grep -v '^$' | wc -l)
UNHANDLED_COUNT=$(echo -e "$UNHANDLED" | grep -v '^$' | wc -l)

echo "Total callbacks: $(echo "$CALLBACKS" | wc -l)"
echo "Handled: $HANDLED_COUNT"
echo "Unhandled: $UNHANDLED_COUNT"

if [ "$UNHANDLED_COUNT" -gt 0 ]; then
    echo
    echo "❌ UNHANDLED CALLBACKS:"
    echo -e "$UNHANDLED" | grep -v '^$'
    echo
    echo "❌ Some callbacks are not handled!"
    exit 1
else
    echo
    echo "✅ All callbacks appear to be handled!"
fi
